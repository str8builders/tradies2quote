import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Control the request User-Agent that native-shell.ts reads.
let mockUa = "";
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k.toLowerCase() === "user-agent" ? mockUa : null),
  }),
}));

import { AI_CONSENT_VERSION, aiConsentGate, hasAiConsent } from "./ai-consent";

/** Minimal supabase stub: profiles.select().eq().maybeSingle() → the row. */
function fakeSupabase(aiConsentAt: string | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ai_consent_at: aiConsentAt }, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const WEB_UA = "Mozilla/5.0 (iPhone) Safari/604.1";
const NATIVE_UA = "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell";

describe("hasAiConsent", () => {
  it("true when a consent timestamp is on the profile", async () => {
    expect(await hasAiConsent(fakeSupabase("2026-07-18T00:00:00Z"), "u")).toBe(true);
  });
  it("false when null", async () => {
    expect(await hasAiConsent(fakeSupabase(null), "u")).toBe(false);
  });
});

describe("aiConsentGate — native-shell scoped (5.1.2(i))", () => {
  it("WEB request always proceeds, even without consent", async () => {
    mockUa = WEB_UA;
    expect(await aiConsentGate(fakeSupabase(null), "u")).toBeNull();
  });

  it("NATIVE + consented proceeds", async () => {
    mockUa = NATIVE_UA;
    expect(await aiConsentGate(fakeSupabase("2026-07-18T00:00:00Z"), "u")).toBeNull();
  });

  it("NATIVE + NOT consented → 403 (blocks the AI egress)", async () => {
    mockUa = NATIVE_UA;
    const res = await aiConsentGate(fakeSupabase(null), "u");
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = (await res?.json()) as { error?: string };
    expect(body.error).toBe("ai_consent_required");
  });
});

describe("AI_CONSENT_VERSION", () => {
  it("is a stable non-empty string (bump forces re-consent)", () => {
    expect(typeof AI_CONSENT_VERSION).toBe("string");
    expect(AI_CONSENT_VERSION.length).toBeGreaterThan(0);
  });
});
