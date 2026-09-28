import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown, pdf: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/invoice-pdf-generator", () => ({ generateInvoicePdf: (...a: unknown[]) => state.pdf(...a) }));
vi.mock("@/lib/pdf-logo", () => ({ loadLogoForPdf: async () => null }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  consumeFixedWindow: () => ({ ok: true }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));

import { GET } from "./route";

let invoice: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00.000Z") });
  invoice = {
    id: "inv-1", invoice_number: "INV-FIXTURE", created_at: "2026-09-01T09:00:00.000Z",
    due_date: "2026-09-08T09:00:00.000Z", sent_at: null,
    invoice_data: { client: { name: "Fixture Client" }, line_items: [] },
  };
  const db = fakeSupabase((op: FakeOp) =>
    op.table === "invoices" ? { data: invoice } : { data: { business_name: "Fixture Builders" } },
  );
  state.client = { auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: db.from };
  state.pdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});
afterEach(() => vi.useRealTimers());

const get = () =>
  GET(new NextRequest("https://tradies2quote.com/api/invoices/inv-1/pdf"), { params: Promise.resolve({ id: "inv-1" }) });

describe("owner invoice PDF — the due date matches the app", () => {
  it("an unsent invoice prints the due date it gets when sent (term restarted from today)", async () => {
    expect((await get()).status).toBe(200);
    // Same rule as "I've sent it" and the email send: 7-day term from now.
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ dueDate: "2026-10-01T10:00:00.000Z" });
  });

  it("a sent invoice prints the date the client was given", async () => {
    invoice.sent_at = "2026-09-10T00:00:00.000Z";
    await get();
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ dueDate: "2026-09-08T09:00:00.000Z" });
  });

  it("an invoice due on receipt stays on receipt", async () => {
    invoice.due_date = null;
    await get();
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ dueDate: null });
  });
});
