// The 402 the AI routes answer with once the trial has ended: exactly as
// before on the website; in the iPhone app no subscribe wording and no link
// to the plans page (App Store 3.1.3(f)).

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ua: "" }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k.toLowerCase() === "user-agent" ? h.ua : null) }),
}));

import { trialEndedResponse } from "./trial-ended-response";

const WEB_UA = "Mozilla/5.0 (iPhone) Version/18 Safari/604.1";
const APP_UA = "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell";

describe("trialEndedResponse", () => {
  it("website: the route's sentence and the plans link, unchanged", async () => {
    h.ua = WEB_UA;
    const res = await trialEndedResponse("Your free trial has ended. Subscribe to keep generating new quotes.");
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "trial_expired",
      message: "Your free trial has ended. Subscribe to keep generating new quotes.",
      upgrade_url: "/app/upgrade",
    });
  });

  it("iPhone app: only that new quotes are paused", async () => {
    h.ua = APP_UA;
    const res = await trialEndedResponse("Your free trial has ended. Subscribe to keep generating new quotes.");
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ error: "trial_expired", message: "New quotes are paused on this account." });
    expect(JSON.stringify(body)).not.toMatch(/subscri|upgrade|plan|trial has|price/i);
  });
});
