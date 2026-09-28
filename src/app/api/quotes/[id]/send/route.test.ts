import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

/**
 * Emailing a quote (audit 2026-09-28): what a send does to the status and
 * the expiry. A first send, or sending a declined / expired quote again,
 * makes it "sent"; a reminder never walks "viewed" back to "sent" or moves
 * sent_at; an acceptance that lands mid-send is never reverted; and the
 * link (and the PDF's valid-until) always has a live date.
 */
const state = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  pdf: vi.fn(),
  email: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/pdf-generator", () => ({ generateQuotePdf: (...a: unknown[]) => state.pdf(...a) }));
vi.mock("@/lib/pdf-logo", () => ({ loadLogoForPdf: async () => null }));
vi.mock("@/lib/email-quote", () => ({ sendQuoteEmail: (...a: unknown[]) => state.email(...a) }));
vi.mock("@/lib/quote-storage", () => ({ uploadPdf: (...a: unknown[]) => state.upload(...a) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  consumeFixedWindow: () => ({ ok: true }),
  consumeDailyQuota: () => ({ ok: true }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/quote-validation", () => ({
  SEND_ERROR_MESSAGES: {},
  validateQuoteForSending: () => ({ ok: true, resolvedEmail: "client@example.invalid" }),
}));

import { POST } from "./route";

const NOW = "2026-09-28T10:00:00.000Z";
const IN_30_DAYS = "2026-10-28T10:00:00.000Z";
let quote: Record<string, unknown>;
let adminDb: ReturnType<typeof fakeSupabase>;
/** What the conditional updates report: the rows they changed. */
let preSendRows: unknown[];
let flipRows: unknown[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  quote = {
    id: "quote-1", user_id: "owner-1", status: "draft", version: 3, created_at: "2026-09-01T00:00:00Z",
    total_amount: 1322.5, currency: "NZD", public_token: "tok-1", pdf_path: null, expires_at: null,
    voice_transcript: null, quote_data: { client: { name: "Sam Taylor", email: "client@example.invalid" }, line_items: [] },
  };
  preSendRows = [{ id: "quote-1" }];
  flipRows = [{ id: "quote-1" }];
  const userDb = fakeSupabase((op: FakeOp) =>
    op.table === "quotes" ? { data: quote } : { data: { business_name: "Taylor Carpentry", email: null } },
  );
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
    from: userDb.from,
    rpc: async () => ({ error: null }),
  };
  adminDb = fakeSupabase((op: FakeOp) => {
    if (op.table !== "quotes" || op.action !== "update") return {};
    return { data: "status" in (op.values as object) ? flipRows : preSendRows };
  });
  state.admin = { from: adminDb.from };
  state.pdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  state.email.mockReset().mockResolvedValue({ ok: true });
  state.upload.mockReset().mockResolvedValue("owner-1/quote-1/quote-v2.pdf");
});
afterEach(() => vi.useRealTimers());

const send = () =>
  POST(new NextRequest("https://tradies2quote.com/api/quotes/quote-1/send", { method: "POST" }), {
    params: Promise.resolve({ id: "quote-1" }),
  });
const updates = () => adminDb.ops.filter((op) => op.table === "quotes" && op.action === "update");
const preSend = () => updates().find((op) => "pdf_path" in (op.values as object));
const statusFlip = () => updates().find((op) => "status" in (op.values as object));
const sentEvent = () => adminDb.ops.find((op) => op.table === "quote_events" && op.action === "insert");

describe("emailing a quote — status", () => {
  it.each(["draft", "declined", "expired"])("a %s quote becomes sent, stamped now", async (status) => {
    quote.status = status;
    expect((await send()).status).toBe(200);
    expect(statusFlip()?.values).toEqual({ status: "sent", sent_at: NOW, viewed_at: null });
    // Guarded: only flips while still draft / declined / expired.
    expect(statusFlip()?.filters).toContainEqual(["in", "status", ["draft", "declined", "expired"]]);
    expect(sentEvent()?.values).toMatchObject({ type: "sent", metadata: { to: "client@example.invalid" } });
    expect((sentEvent()?.values as { metadata: object }).metadata).not.toHaveProperty("resend");
  });

  it.each(["sent", "viewed"])("a reminder on a %s quote leaves the status and sent_at alone", async (status) => {
    quote.status = status;
    quote.expires_at = "2026-10-05T00:00:00.000Z";
    expect((await send()).status).toBe(200);
    expect(state.email).toHaveBeenCalledTimes(1);
    expect(statusFlip()).toBeUndefined();
    expect(updates().some((op) => "sent_at" in (op.values as object))).toBe(false);
    expect(sentEvent()?.values).toMatchObject({ metadata: { resend: true } });
  });

  it("a client accepting while the email goes out keeps their acceptance", async () => {
    flipRows = []; // the row is 'accepted' by the time the flip runs
    const res = await send();
    expect(res.status).toBe(200);
    expect(statusFlip()?.filters).toContainEqual(["in", "status", ["draft", "declined", "expired"]]);
  });

  it("a quote accepted before the send starts is not emailed again", async () => {
    preSendRows = [];
    const res = await send();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "already_accepted" });
    expect(state.email).not.toHaveBeenCalled();
    expect(preSend()?.filters).toContainEqual(["in", "status", ["draft", "sent", "viewed", "declined", "expired"]]);
  });

  it("a failed email changes no status", async () => {
    state.email.mockResolvedValue({ ok: false, error: "send_failed" });
    expect((await send()).status).toBe(502);
    expect(statusFlip()).toBeUndefined();
  });
});

describe("emailing a quote — the link's expiry", () => {
  it("a first send gets 30 days, and the PDF prints the same date", async () => {
    await send();
    expect(preSend()?.values).toMatchObject({ expires_at: IN_30_DAYS, public_token: "tok-1", pdf_version: 3 });
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ validUntil: IN_30_DAYS });
  });

  it.each([
    ["declined", "2026-09-01T00:00:00.000Z"],
    ["expired", "2026-09-20T00:00:00.000Z"],
    ["viewed", "2026-09-27T00:00:00.000Z"],
  ])("sending a %s quote whose date has passed gives the link a fresh 30 days", async (status, past) => {
    quote.status = status;
    quote.expires_at = past;
    await send();
    expect(preSend()?.values).toMatchObject({ expires_at: IN_30_DAYS });
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ validUntil: IN_30_DAYS });
  });

  it("a live expiry is kept on a re-send", async () => {
    quote.status = "sent";
    quote.expires_at = "2026-10-05T00:00:00.000Z";
    await send();
    expect(preSend()?.values).toMatchObject({ expires_at: "2026-10-05T00:00:00.000Z" });
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ validUntil: "2026-10-05T00:00:00.000Z" });
  });
});
