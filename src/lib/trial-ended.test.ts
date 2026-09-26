// A finished trial, in the iPhone app's words: "paused", never "subscribe"
// (App Store 3.1.3(f)). The website keeps each place's own sentence.

import { afterEach, describe, expect, it, vi } from "vitest";
import { inIPhoneApp, NEW_QUOTES_PAUSED, requestNoteForApp, trialEndedMessage } from "./trial-ended";
import { transcribeFailure } from "@/app/app/quotes/new/_v2/lib/copy";
import { scanErrorMessage } from "@/app/app/quotes/new/_components/ScanPanel";
import { photoPlanErrorMessage } from "@/lib/agents/photoPlanErrors";

const MONEY = /subscri|plan|trial|upgrade|price|\$/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trialEndedMessage", () => {
  it("the website keeps its own sentence; the app only hears that new quotes are paused", () => {
    const web = "Your free trial has ended. Subscribe to keep making quotes.";
    expect(trialEndedMessage(web, false)).toBe(web);
    expect(trialEndedMessage(web, true)).toBe("New quotes are paused on this account.");
    expect(NEW_QUOTES_PAUSED).not.toMatch(MONEY);
  });
});

describe("requestNoteForApp", () => {
  it("a saved request note that talks about the subscription is plain in the app, unchanged on the web", () => {
    const note = "Subscription inactive; generate from the draft.";
    expect(requestNoteForApp(note, false)).toBe(note);
    expect(requestNoteForApp(note, true)).toBe(NEW_QUOTES_PAUSED);
    expect(requestNoteForApp("The AI provider timed out.", true)).toBe("The AI provider timed out.");
  });
});

describe("inIPhoneApp (browser check)", () => {
  it("false on the server", () => {
    expect(inIPhoneApp()).toBe(false);
  });

  it("true for the shell's user-agent marker or the Capacitor bridge, false for a browser", () => {
    vi.stubGlobal("window", { navigator: { userAgent: "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell" } });
    expect(inIPhoneApp()).toBe(true);
    vi.stubGlobal("window", {
      navigator: { userAgent: "Mozilla/5.0 (iPhone)" },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(inIPhoneApp()).toBe(true);
    vi.stubGlobal("window", { navigator: { userAgent: "Mozilla/5.0 (iPhone) Version/18 Safari/604.1" } });
    expect(inIPhoneApp()).toBe(false);
  });
});

describe("the error words the new-quote screens show", () => {
  it("voice notes: paused in the app, the old sentence on the web", () => {
    expect(transcribeFailure(402, { error: "trial_expired" }, true)).toEqual({ error: NEW_QUOTES_PAUSED, retryable: false });
    expect(transcribeFailure(402, { error: "trial_expired" }, false).error).toBe(
      "Your free trial has ended. Subscribe to keep making quotes.",
    );
  });

  it("drawing scans: paused in the app, by code or by status", () => {
    expect(scanErrorMessage(402, { error: "trial_expired" }, true)).toBe(NEW_QUOTES_PAUSED);
    expect(scanErrorMessage(402, {}, true)).toBe(NEW_QUOTES_PAUSED);
    expect(scanErrorMessage(402, { error: "trial_expired" }, false)).toBe(
      "Your free trial has ended. Subscribe to keep scanning drawings.",
    );
    // Other refusals are untouched in the app.
    expect(scanErrorMessage(429, { error: "rate_limited" }, true)).toMatch(/drawing-scan limit/);
  });

  it("photo reading: the route's own (already plain) sentence, else paused in the app", () => {
    expect(photoPlanErrorMessage(402, { error: "trial_expired" }, true)).toBe(NEW_QUOTES_PAUSED);
    expect(photoPlanErrorMessage(402, { error: "trial_expired", message: NEW_QUOTES_PAUSED }, true)).toBe(NEW_QUOTES_PAUSED);
    expect(photoPlanErrorMessage(402, { error: "trial_expired" }, false)).toBe(
      "Your free trial has ended. Subscribe to keep using photo reading.",
    );
  });
});
