import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Automatic follow-ups and review requests (audit 2026-09-28): they went to
 * the client record linked by quotes.client_id (which the public request
 * form links loosely), included deleted and expired quotes, and had no
 * reply-to, so a client's answer never reached the tradie.
 */

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  followup: vi.fn(),
  review: vi.fn(),
  queries: [] as Array<{ table: string; calls: Array<[string, unknown[]]> }>,
  data: {} as Record<string, unknown>,
  events: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ from: mock.from }) }));
vi.mock("@/lib/engagement", async (original) => ({
  ...(await original<typeof import("@/lib/engagement")>()),
  reviewsEnabled: () => true,
  followupsEnabled: () => true,
  sendFollowupEmail: mock.followup,
  sendReviewRequestEmail: mock.review,
}));

import { POST } from "./route";

const request = () =>
  new NextRequest("http://localhost/api/cron/engagement", {
    method: "POST",
    headers: { authorization: `Bearer ${"test-only-".repeat(6)}` },
  });

const NOW = new Date("2026-09-28T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("CRON_SECRET", "test-only-".repeat(6));
  mock.queries = [];
  mock.followup.mockResolvedValue({ ok: true, messageId: "m1" });
  mock.review.mockResolvedValue({ ok: true, messageId: "m2" });
  mock.events = {
    q_sent: [{ metadata: { to: "sent-to@client.example" }, created_at: "2026-09-20T00:00:00Z" }],
    q_texted: [{ metadata: { channel: "sms", to: "+64211234567" }, created_at: "2026-09-20T00:00:00Z" }],
    q_done: [
      { metadata: { to: "resent-to@client.example" }, created_at: "2026-09-10T00:00:00Z" },
      { metadata: { to: "first-try@client.example" }, created_at: "2026-09-01T00:00:00Z" },
    ],
  };
  mock.data = {
    feature_settings: [{ user_id: "tradie", auto_followup_enabled: true, auto_review_enabled: true, google_review_url: "https://g.page/r/fixture" }],
    profiles: [{ id: "tradie", business_name: "Bayside Builders", currency: "NZD", email: "office@bayside.example" }],
  };
  mock.from.mockImplementation((table: string) => {
    const record = { table, calls: [] as Array<[string, unknown[]]> };
    mock.queries.push(record);
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "in", "gte", "not", "lte", "is", "order", "limit", "insert", "delete"]) {
      query[method] = (...args: unknown[]) => {
        record.calls.push([method, args]);
        return query;
      };
    }
    const result = () => {
      if (table === "quote_events") {
        const quoteId = record.calls.find(([m, a]) => m === "eq" && a[0] === "quote_id")?.[1][1] as string;
        return { data: mock.events[quoteId] ?? [], error: null };
      }
      if (table === "quotes") {
        const completed = record.calls.some(([m, a]) => m === "eq" && a[0] === "status" && a[1] === "completed");
        return {
          data: completed
            ? [{ id: "q_done", client_id: "linked-client", completed_at: "2026-09-25T00:00:00Z", client_name: "Aroha", client_email: "on-quote@client.example", client_contact: null }]
            : [
                { id: "q_sent", client_id: "linked-client", sent_at: "2026-09-24T00:00:00Z", public_token: "tok1", total_amount: 1150, currency: "NZD", created_at: "2026-09-20T00:00:00Z", expires_at: "2026-10-20T00:00:00Z", client_name: "Aroha", client_email: "edited-later@client.example", client_contact: null },
                { id: "q_texted", client_id: "linked-client", sent_at: "2026-09-24T00:00:00Z", public_token: "tok2", total_amount: 500, currency: "NZD", created_at: "2026-09-20T00:00:00Z", expires_at: null, client_name: "Ben", client_email: "ben@client.example", client_contact: null },
                // The filter excludes expired quotes; if one slips through it is still skipped.
                { id: "q_expired", client_id: "linked-client", sent_at: "2026-08-01T00:00:00Z", public_token: "tok3", total_amount: 90, currency: "NZD", created_at: "2026-07-20T00:00:00Z", expires_at: "2026-08-31T00:00:00Z", client_name: "Cara", client_email: "cara@client.example", client_contact: null },
              ],
          error: null,
        };
      }
      return { data: mock.data[table] ?? null, error: null };
    };
    query.maybeSingle = async () => ({ ...result(), data: null });
    query.then = (resolve: (v: unknown) => void) => resolve(result());
    return query;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("engagement emails", () => {
  it("follow-ups go to the address the quote was emailed to, with the tradie as reply-to", async () => {
    expect((await POST(request())).status).toBe(200);
    const sent = mock.followup.mock.calls.map(([args]) => args as { to: string; replyTo: string; clientName: string });
    expect(sent.find((a) => a.clientName === "Aroha")).toMatchObject({ to: "sent-to@client.example", replyTo: "office@bayside.example" });
  });

  it("a quote that was only texted falls back to the email written on the quote", async () => {
    await POST(request());
    const sent = mock.followup.mock.calls.map(([args]) => args as { to: string; clientName: string });
    expect(sent.find((a) => a.clientName === "Ben")?.to).toBe("ben@client.example");
  });

  it("never emails the loosely-linked client record", async () => {
    await POST(request());
    expect(mock.queries.some((q) => q.table === "clients")).toBe(false);
  });

  it("skips deleted and expired quotes", async () => {
    await POST(request());
    const followupQuery = mock.queries.find((q) => q.table === "quotes" && q.calls.some(([m, a]) => m === "in" && a[0] === "status"));
    expect(followupQuery?.calls).toContainEqual(["is", ["deleted_at", null]]);
    expect(followupQuery?.calls).toContainEqual(["or", [`expires_at.is.null,expires_at.gt.${NOW.toISOString()}`]]);
    const reviewQuery = mock.queries.find((q) => q.table === "quotes" && q.calls.some(([m, a]) => m === "eq" && a[1] === "completed"));
    expect(reviewQuery?.calls).toContainEqual(["is", ["deleted_at", null]]);
    const names = mock.followup.mock.calls.map(([args]) => (args as { clientName: string }).clientName);
    expect(names).not.toContain("Cara");
  });

  it("covers every emailed quote, not only ones from the request form, sent in the last 14 days", async () => {
    await POST(request());
    const followupQuery = mock.queries.find((q) => q.table === "quotes" && q.calls.some(([m, a]) => m === "in" && a[0] === "status"));
    const reviewQuery = mock.queries.find((q) => q.table === "quotes" && q.calls.some(([m, a]) => m === "eq" && a[1] === "completed"));
    for (const query of [followupQuery, reviewQuery]) {
      expect(query?.calls.some(([m, a]) => m === "not" && a[0] === "client_id")).toBe(false);
    }
    expect(followupQuery?.calls).toContainEqual(["gte", ["sent_at", new Date(NOW.getTime() - 14 * 24 * 3600 * 1000).toISOString()]]);
  });

  it("review requests go to the newest address the quote was sent to", async () => {
    await POST(request());
    expect(mock.review).toHaveBeenCalledTimes(1);
    expect(mock.review.mock.calls[0][0]).toMatchObject({ to: "resent-to@client.example", clientName: "Aroha", replyTo: "office@bayside.example" });
  });
});
