import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  consented: true,
  tradie: { id: "tradie-1", business_name: "STR8 Builders", email: "owner@example.com" } as
    | { id: string; business_name: string | null; email: string | null }
    | null,
  created: vi.fn(async (_opts: { tradieUserId: string; sourceIp: string | null }) => ({ requestId: "req-1", quoteId: "quote-1", clientId: "client-1" })),
  notify: vi.fn(async () => undefined),
  generate: vi.fn(async () => "generated" as const),
  moderation: { allowed: true },
  canWrite: true,
}));

vi.mock("@/lib/ai-consent", () => ({ AI_CONSENT_VERSION: "2026-09-external-ai-v2", hasAiConsent: async () => mock.consented }));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.com", created_at: "2026-09-01T00:00:00Z" } } }) } },
    from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/quote-requests/intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quote-requests/intake")>();
  return {
    ...actual,
    findTradieBySlug: async () => mock.tradie,
    createQuoteRequest: mock.created,
    notifyTradieOfRequest: mock.notify,
    runRequestGeneration: mock.generate,
  };
});
vi.mock("@/lib/moderation", () => ({
  moderateChatText: async () => mock.moderation,
  matchesBlocklist: () => !mock.moderation.allowed,
  sanitizeForPush: (s: string) => s,
}));
vi.mock("@/lib/subscription", () => ({
  getSubscriptionStatus: async () => ({ state: mock.canWrite ? "trialing" : "expired" }),
  canWrite: () => mock.canWrite,
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";

const body = {
  aiConsentVersion: "2026-09-external-ai-v2",
  name: "Sarah Smith",
  phone: "021 555 1234",
  email: "sarah@example.com",
  address: "12 Beach Rd",
  description: "Replace 12 metres of old timber fence along the driveway, 1.8 high, and take the old one away.",
};

let ipCounter = 0;
function post(slug: string, payload: unknown, headers: Record<string, string> = {}) {
  ipCounter += 1;
  const req = new NextRequest(`https://tradies2quote.com/api/requests/${slug}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipCounter}`, ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  return POST(req, { params: Promise.resolve({ slug }) });
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("POST /api/requests/[slug]", () => {
  beforeEach(() => {
    mock.tradie = { id: "tradie-1", business_name: "STR8 Builders", email: "owner@example.com" };
    mock.moderation = { allowed: true };
    mock.canWrite = true;
    mock.consented = true;
    mock.created.mockClear();
    mock.notify.mockClear();
    mock.generate.mockClear();
  });

  it("creates the request, notifies and generates on the happy path", async () => {
    const res = await post("str8-builders", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, business: "STR8 Builders" });
    await flush();
    expect(mock.created).toHaveBeenCalledTimes(1);
    expect(mock.created.mock.calls[0][0]).toMatchObject({ tradieUserId: "tradie-1", sourceIp: expect.stringMatching(/^198\.51\.100\./) });
    expect(mock.notify).toHaveBeenCalledTimes(1);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it("accepts a customer request without sending it to AI when permission is absent", async () => {
    const res = await post("str8-builders", { ...body, aiConsentVersion: "" });
    expect(res.status).toBe(200); await flush();
    expect(mock.created.mock.calls[0][0]).toMatchObject({ aiConsentVersion: null });
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("honours the business withdrawing AI permission", async () => {
    mock.consented = false;
    expect((await post("str8-builders", body)).status).toBe(200); await flush();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it("404s for an unknown or malformed slug", async () => {
    mock.tradie = null;
    expect((await post("nobody-here", body)).status).toBe(404);
    expect((await post("BAD SLUG", body)).status).toBe(404);
    expect(mock.created).not.toHaveBeenCalled();
  });

  it("rejects invalid input with the validation message", async () => {
    const res = await post("str8-builders", { ...body, phone: "", email: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/phone number or an email/);
    expect((await post("str8-builders", "not json")).status).toBe(400);
  });

  it("pretends success on the honeypot without creating anything", async () => {
    const res = await post("str8-builders", { ...body, website: "http://spam" });
    expect(res.status).toBe(200);
    await flush();
    expect(mock.created).not.toHaveBeenCalled();
    expect(mock.notify).not.toHaveBeenCalled();
  });

  it("blocks descriptions the moderator refuses", async () => {
    mock.moderation = { allowed: false };
    const res = await post("str8-builders", body);
    expect(res.status).toBe(400);
    expect(mock.created).not.toHaveBeenCalled();
  });

  it("turns away link-preview crawlers", async () => {
    const res = await post("str8-builders", body, { "user-agent": "facebookexternalhit/1.1" });
    expect(res.status).toBe(403);
  });

  it("still records the request but skips generation when the tradie cannot write", async () => {
    mock.canWrite = false;
    const res = await post("str8-builders", body);
    expect(res.status).toBe(200);
    await flush();
    expect(mock.created).toHaveBeenCalledTimes(1);
    expect(mock.notify).toHaveBeenCalledTimes(1);
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it("rate-limits a single IP", async () => {
    const ip = "203.0.113.77";
    let last = 200;
    for (let i = 0; i < 11; i += 1) {
      const res = await post("str8-builders", body, { "x-forwarded-for": ip });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
