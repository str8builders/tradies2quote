import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pushCanToggle, pushStatusText, VAPID_PUBLIC_KEY, type PushState } from "./push";

const STATES: PushState[] = ["checking", "unsupported", "off", "working", "on", "denied", "error"];

describe("quote notifications", () => {
  it("every state has one plain sentence", () => {
    for (const state of STATES) {
      const text = pushStatusText(state);
      expect(text.length, state).toBeGreaterThan(5);
      expect(text).not.toMatch(/\/\/|VAPID|APNs|service worker/i);
    }
    expect(pushStatusText("on")).toMatch(/accepts a quote/);
    expect(pushStatusText("unsupported")).toMatch(/Home Screen/);
  });

  it("the switch works only where the phone lets us ask", () => {
    expect(STATES.filter(pushCanToggle)).toEqual(["off", "on", "error"]);
  });

  it("uses the same public key as the account menu's switch", () => {
    const pushToggle = readFileSync(join(process.cwd(), "src/app/app/_components/PushToggle.tsx"), "utf8");
    const theirs = /"(B[A-Za-z0-9_-]{80,})"/.exec(pushToggle)?.[1];
    expect(theirs).toBeTruthy();
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) expect(VAPID_PUBLIC_KEY).toBe(theirs);
    expect(readFileSync(join(process.cwd(), "src/app/app/settings/_newlook/push.ts"), "utf8")).toContain(`"${theirs}"`);
  });
});
