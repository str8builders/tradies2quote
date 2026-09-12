import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  name: null as string | null | undefined,
  profileError: false,
  profileMissing: false,
  user: true,
  quoteVisible: true,
  pdf: vi.fn(), logo: vi.fn(), upload: vi.fn(), email: vi.fn(), sms: vi.fn(), admin: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/pdf-generator", () => ({ generateQuotePdf: mock.pdf }));
vi.mock("@/lib/pdf-logo", () => ({ loadLogoForPdf: mock.logo }));
vi.mock("@/lib/quote-storage", () => ({ uploadPdf: mock.upload }));
vi.mock("@/lib/email-quote", () => ({ sendQuoteEmail: mock.email }));
vi.mock("@/lib/sms-quote", () => ({ sendQuoteSms: mock.sms, smsConfigured: () => true, buildSmsBody: vi.fn() }));
vi.mock("@/lib/quote-validation", () => ({
  SEND_ERROR_MESSAGES: {},
  validateQuoteForSending: () => ({ ok: true, resolvedEmail: "client@example.invalid" }),
  validateQuoteForSmsSending: () => ({ ok: true, resolvedPhone: "+64211234567" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: mock.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mock.user ? { id: "owner-fixture" } : null } }) },
  rpc: async () => ({ error: null }),
  from: (table: string) => {
    const result = () => table === "profiles"
      ? { data: mock.profileMissing ? null : { business_name: mock.name }, error: mock.profileError ? { message: "offline" } : null }
      : { data: mock.quoteVisible ? { id: "12345678-fixture", user_id: "owner-fixture", status: "draft", created_at: "2026-09-13T00:00:00Z", total_amount: 100, currency: "NZD", quote_data: { client: { name: "Test client" } } } : null, error: null };
    const query = { select: () => query, eq: () => query, single: async () => result(), maybeSingle: async () => result() };
    return query;
  },
}) }));

import { POST as send } from "./send/route";
import { POST as sms } from "./sms/route";
import { GET as pdf } from "./pdf/route";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mock, { name: null, profileError: false, profileMissing: false, user: true, quoteVisible: true });
  mock.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  mock.logo.mockResolvedValue(null);
  mock.upload.mockResolvedValue("owner-fixture/quote.pdf");
  mock.email.mockResolvedValue({ ok: true });
  mock.sms.mockResolvedValue({ ok: true, sid: "fixture" });
  mock.admin.mockImplementation(() => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) }) }));
});

describe.each([["send", send], ["sms", sms], ["pdf", pdf]] as const)("%s business identity guard", (route, handle) => {
  const request = () => handle(new NextRequest(`https://example.invalid/api/quotes/fixture/${route}`, { method: route === "pdf" ? "GET" : "POST" }), { params: Promise.resolve({ id: "12345678-fixture" }) });
  it.each([null, undefined, "", " \t\n "])("blocks a missing or blank business name (%s) before any document or delivery", async (name) => {
    mock.name = name;
    const result = await request();
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ error: "business_name_required", settings_url: "/app/settings", message: expect.stringContaining("business name") });
    for (const fn of [mock.pdf, mock.logo, mock.upload, mock.email, mock.sms, mock.admin]) expect(fn).not.toHaveBeenCalled();
  });
  it("blocks an absent profile", async () => {
    mock.profileMissing = true;
    expect((await request()).status).toBe(400);
    expect(mock.pdf).not.toHaveBeenCalled();
  });
  it("reports a failed profile lookup as retryable", async () => {
    mock.profileError = true;
    expect((await request()).status).toBe(503);
    expect(mock.pdf).not.toHaveBeenCalled();
  });
  it("requires authentication and quote ownership", async () => {
    mock.user = false;
    expect((await request()).status).toBe(401);
    mock.user = true; mock.quoteVisible = false;
    expect((await request()).status).toBe(404);
    expect(mock.pdf).not.toHaveBeenCalled();
  });
  it("uses the saved and trimmed business name for a valid document", async () => {
    mock.name = "  Fixture Builders  ";
    expect((await request()).status).toBe(200);
    expect(mock.pdf).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ business_name: "Fixture Builders" }) }));
    if (route === "send") expect(mock.email).toHaveBeenCalledWith(expect.objectContaining({ businessName: "Fixture Builders" }));
    if (route === "sms") expect(mock.sms).toHaveBeenCalledWith(expect.objectContaining({ businessName: "Fixture Builders" }));
  });
});
