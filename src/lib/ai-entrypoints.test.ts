import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "owner@example.test" } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
}) }));
const routes = [
  { route: "materials/extract-quote", load: () => import("../app/api/materials/extract-quote/route") },
  { route: "materials/suggest-price", load: () => import("../app/api/materials/suggest-price/route") },
  { route: "suppliers/extract", load: () => import("../app/api/suppliers/extract/route") },
  { route: "plans/classify", load: () => import("../app/api/plans/classify/route") },
  { route: "plans/extract", load: () => import("../app/api/plans/extract/route") },
  { route: "agents/customer-reply", load: () => import("../app/api/agents/customer-reply/route") },
  { route: "agents/materials-takeoff", load: () => import("../app/api/agents/materials-takeoff/route") },
  { route: "agents/photo-plan", load: () => import("../app/api/agents/photo-plan/route") },
  { route: "agents/quote-generation", load: () => import("../app/api/agents/quote-generation/route") },
  { route: "agents/diagnose", load: () => import("../app/api/agents/diagnose/route") },
];
describe("AI disclosure before processing", () => {
  it.each(routes)("blocks $route without consent before reading content or calling a provider", async ({ route, load }) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const handler = await load();
    const request = new NextRequest(`https://tradies2quote.com/api/${route}`, { method: "POST", body: "invalid JSON must not reach processing" });
    const response = await handler.POST(request);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("ai_consent_required");
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
});
