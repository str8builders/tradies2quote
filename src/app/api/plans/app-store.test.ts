// The plan reader in the iPhone app: no plan page goes to AI without the
// recorded AI consent (App Store 5.1.2(i)), and a finished trial is only
// "paused" (3.1.3(f)). The website is unchanged: no consent wall, and the
// old trial sentence with its plans link.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ ua: "", consentAt: null as string | null, canWrite: true }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k.toLowerCase() === "user-agent" ? h.ua : null) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "t@example.invalid", created_at: "2026-09-01T00:00:00Z" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const { AI_CONSENT_VERSION } = await vi.importActual<typeof import("@/lib/ai-consent")>("@/lib/ai-consent");
            return { data: { ai_consent_at: h.consentAt, ai_consent_version: AI_CONSENT_VERSION }, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/planreader/flag", () => ({ planReaderAllowed: () => true }));
vi.mock("@/lib/subscription", () => ({ getSubscriptionStatus: async () => ({ state: "expired" }), canWrite: () => h.canWrite }));
vi.mock("@/lib/rate-limit", () => ({ consumeDailyQuota: () => ({ ok: true }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST as classify } from "./classify/route";
import { POST as extract } from "./extract/route";
import { POST as ingest } from "./ingest/route";

const WEB_UA = "Mozilla/5.0 (iPhone) Version/18 Safari/604.1";
const APP_UA = "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell";

const ROUTES = [
  ["classify", classify],
  ["extract", extract],
  ["ingest", ingest],
] as const;

const post = (route: (typeof ROUTES)[number][1], name: string) =>
  route(new NextRequest(`https://tradies2quote.com/api/plans/${name}`, { method: "POST", body: JSON.stringify({ file_id: "f-1" }) }));

beforeEach(() => {
  h.consentAt = null;
  h.canWrite = true;
});

describe.each(ROUTES)("POST /api/plans/%s", (name, route) => {
  it("iPhone app without AI consent: refused before anything is read or uploaded", async () => {
    h.ua = APP_UA;
    h.canWrite = false; // the consent check comes first
    const res = await post(route, name);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ai_consent_required");
  });

  it("iPhone app, consented, trial over: paused, no subscribe wording or plans link", async () => {
    h.ua = APP_UA;
    h.consentAt = "2026-09-20T00:00:00Z";
    h.canWrite = false;
    const res = await post(route, name);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "trial_expired", message: "New quotes are paused on this account." });
  });

  it("website: no consent wall, and the trial sentence with its plans link as before", async () => {
    h.ua = WEB_UA;
    h.canWrite = false;
    const res = await post(route, name);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "trial_expired",
      message: "Your free trial has ended. Subscribe to keep reading plans.",
      upgrade_url: "/app/upgrade",
    });
  });
});
