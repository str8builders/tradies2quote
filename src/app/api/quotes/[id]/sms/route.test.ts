import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

/**
 * Texting a quote (audit 2026-09-28). Platform texts (Twilio) flip the status
 * here with the same rules as email; texts from the tradie's own phone are
 * only prepared here and marked sent by /sms/sent.
 */
const state = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  pdf: vi.fn(),
  sms: vi.fn(),
  configured: true,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/pdf-generator", () => ({ generateQuotePdf: (...a: unknown[]) => state.pdf(...a) }));
vi.mock("@/lib/pdf-logo", () => ({ loadLogoForPdf: async () => null }));
vi.mock("@/lib/quote-storage", () => ({ uploadPdf: async () => "owner-1/quote-1/quote-v2.pdf" }));
vi.mock("@/lib/sms-quote", () => ({
  sendQuoteSms: (...a: unknown[]) => state.sms(...a),
  smsConfigured: () => state.configured,
  buildSmsBody: () => "Hi Sam, your quote…",
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  consumeFixedWindow: () => ({ ok: true }),
  consumeDailyQuota: () => ({ ok: true }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/quote-validation", () => ({
  SEND_ERROR_MESSAGES: {},
  validateQuoteForSmsSending: () => ({ ok: true, resolvedPhone: "+64215550101" }),
}));

import { POST } from "./route";

const NOW = "2026-09-28T10:00:00.000Z";
const IN_30_DAYS = "2026-10-28T10:00:00.000Z";
let quote: Record<string, unknown>;
let adminDb: ReturnType<typeof fakeSupabase>;
let flipRows: unknown[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  state.configured = true;
  quote = {
    id: "quote-1", user_id: "owner-1", status: "declined", version: 2, created_at: "2026-09-01T00:00:00Z",
    total_amount: 500, currency: "NZD", public_token: "tok-1", pdf_path: null, expires_at: "2026-09-10T00:00:00.000Z",
    voice_transcript: null, quote_data: { client: { name: "Sam Taylor", phone: "021 555 0101" }, line_items: [] },
  };
  flipRows = [{ id: "quote-1" }];
  const userDb = fakeSupabase((op: FakeOp) =>
    op.table === "quotes" ? { data: quote } : { data: { business_name: "Taylor Carpentry" } },
  );
  state.client = { auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: userDb.from };
  adminDb = fakeSupabase((op: FakeOp) => {
    if (op.table !== "quotes" || op.action !== "update") return {};
    return { data: "status" in (op.values as object) ? flipRows : [{ id: "quote-1" }] };
  });
  state.admin = { from: adminDb.from };
  state.pdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  state.sms.mockReset().mockResolvedValue({ ok: true, sid: "SM1" });
});
afterEach(() => vi.useRealTimers());

const text = () =>
  POST(new NextRequest("https://tradies2quote.com/api/quotes/quote-1/sms", { method: "POST" }), {
    params: Promise.resolve({ id: "quote-1" }),
  });
const updates = () => adminDb.ops.filter((op) => op.table === "quotes" && op.action === "update");
const statusFlip = () => updates().find((op) => "status" in (op.values as object));

describe("texting a quote by platform text", () => {
  it("sends a declined quote again as a live offer: sent, fresh expiry", async () => {
    expect((await text()).status).toBe(200);
    expect(statusFlip()?.values).toEqual({ status: "sent", sent_at: NOW, viewed_at: null });
    expect(statusFlip()?.filters).toContainEqual(["in", "status", ["draft", "declined", "expired"]]);
    expect(updates()[0].values).toMatchObject({ expires_at: IN_30_DAYS });
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ validUntil: IN_30_DAYS });
  });

  it("a reminder on a viewed quote leaves it viewed", async () => {
    quote.status = "viewed";
    quote.expires_at = "2026-10-05T00:00:00.000Z";
    expect((await text()).status).toBe(200);
    expect(statusFlip()).toBeUndefined();
    expect(updates()[0].values).toMatchObject({ expires_at: "2026-10-05T00:00:00.000Z" });
  });

  it("an acceptance during the send is kept", async () => {
    flipRows = [];
    expect((await text()).status).toBe(200);
  });
});

describe("texting a quote from the tradie's own phone", () => {
  it("prepares the link with a fresh expiry but leaves the status for /sms/sent", async () => {
    state.configured = false;
    const res = await text();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "device" });
    expect(statusFlip()).toBeUndefined();
    expect(updates()[0].values).toMatchObject({ expires_at: IN_30_DAYS, public_token: "tok-1" });
    expect(state.sms).not.toHaveBeenCalled();
  });
});
