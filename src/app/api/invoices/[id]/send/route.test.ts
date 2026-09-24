import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";
import { formatIssueDate } from "@/lib/quote-defaults";

const state = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  pdf: vi.fn(),
  email: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/invoice-pdf-generator", () => ({ generateInvoicePdf: (...a: unknown[]) => state.pdf(...a) }));
vi.mock("@/lib/email-invoice", () => ({ sendInvoiceEmail: (...a: unknown[]) => state.email(...a) }));
vi.mock("@/lib/pdf-logo", () => ({ loadLogoForPdf: async () => null }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  consumeFixedWindow: () => ({ ok: true }),
  consumeDailyQuota: () => ({ ok: true }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));

import { POST } from "./route";

let invoice: Record<string, unknown>;
let adminDb: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00.000Z") });
  invoice = {
    id: "inv-1", user_id: "owner-1", quote_id: "quote-1", invoice_number: "INV-FIXTURE", status: "draft",
    total_amount: 172.5, currency: "NZD", created_at: "2026-09-01T09:00:00.000Z",
    due_date: "2026-09-08T09:00:00.000Z", sent_at: null, paid_at: null,
    invoice_data: { client: { name: "Fixture Client", email: "client@example.invalid" }, line_items: [] },
  };
  const userDb = fakeSupabase((op: FakeOp) =>
    op.table === "invoices" ? { data: invoice } : { data: { business_name: "Fixture Builders", email: null } },
  );
  adminDb = fakeSupabase(() => ({}));
  state.client = { auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: userDb.from };
  state.admin = { from: adminDb.from };
  state.pdf.mockReset().mockResolvedValue(new Uint8Array([1]));
  state.email.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

const send = () =>
  POST(new NextRequest("https://tradies2quote.com/api/invoices/inv-1/send", { method: "POST" }), {
    params: Promise.resolve({ id: "inv-1" }),
  });
const invoiceUpdate = () => adminDb.ops.find((op) => op.table === "invoices" && op.action === "update");

describe("invoice send refreshes the due date", () => {
  it("restarts the payment term on the first send — PDF, email and row agree", async () => {
    expect((await send()).status).toBe(200);
    const due = "2026-10-01T10:00:00.000Z";
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ dueDate: due });
    expect(state.email.mock.calls[0][0]).toMatchObject({ dueDateLabel: formatIssueDate(due) });
    expect(invoiceUpdate()?.values).toMatchObject({ status: "sent", due_date: due, sent_at: "2026-09-24T10:00:00.000Z" });
  });

  it("keeps the original due date on a re-send", async () => {
    Object.assign(invoice, { status: "sent", sent_at: "2026-09-10T00:00:00.000Z" });
    expect((await send()).status).toBe(200);
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ dueDate: "2026-09-08T09:00:00.000Z" });
    expect(invoiceUpdate()?.values).toMatchObject({ due_date: "2026-09-08T09:00:00.000Z" });
  });

  it("changes nothing when the email fails", async () => {
    state.email.mockResolvedValue({ ok: false, error: "send_failed" });
    expect((await send()).status).toBe(502);
    expect(invoiceUpdate()).toBeUndefined();
  });
});
