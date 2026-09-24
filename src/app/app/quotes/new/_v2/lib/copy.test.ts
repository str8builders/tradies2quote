import { describe, expect, it } from "vitest";
import {
  NO_WORDS,
  TRANSCRIBE_HICCUP,
  formatClock,
  micButtonLabel,
  micErrorMessage,
  pageErrorMessage,
  talkStatus,
  transcribeFailure,
  writeButtonLabel,
  writeHint,
} from "./copy";

/** No codes, no shouting, no "//" labels: words a tradie would say. */
function expectPlain(text: string) {
  expect(text).not.toMatch(/_|\/\/|\{|\}|<|>/);
  expect(text).not.toMatch(/^[A-Z\s]{6,}$/);
  expect(text.trim()).toBe(text);
  expect(text[0]).toBe(text[0].toUpperCase());
}

describe("page errors (?error=)", () => {
  it("words the two keys createDraftQuote sends back for the new screens", () => {
    expect(pageErrorMessage("missing-transcript")).toBe("Tell us about the job first, then tap Write my quote.");
    expect(pageErrorMessage("draft-failed")).toBe(
      "We couldn't start that quote. Check your internet connection and try again.",
    );
  });

  it("shows nothing for no key or an unknown one", () => {
    expect(pageErrorMessage(undefined)).toBeUndefined();
    expect(pageErrorMessage(null)).toBeUndefined();
    expect(pageErrorMessage("")).toBeUndefined();
    expect(pageErrorMessage("not-a-real-error")).toBeUndefined();
    expect(pageErrorMessage("toString")).toBeUndefined();
    expect(pageErrorMessage("__proto__")).toBeUndefined();
  });
});

describe("microphone problems", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("says what to do for each way the microphone can refuse", () => {
    expect(micErrorMessage(named("NotAllowedError"))).toMatch(/blocked.*settings/);
    expect(micErrorMessage(named("SecurityError"))).toMatch(/blocked/);
    expect(micErrorMessage(named("NotFoundError"))).toMatch(/couldn't find a microphone/);
    expect(micErrorMessage(named("NotReadableError"))).toMatch(/busy/);
    expect(micErrorMessage(named("Weird"))).toBe("I couldn't start the microphone. Try again, or type the job instead.");
    expect(micErrorMessage("nope")).toBe(micErrorMessage(named("Weird")));
    for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError", "Weird"]) {
      expectPlain(micErrorMessage(named(name)));
    }
  });
});

describe("transcription replies", () => {
  it("maps the route's refusals to plain words, none of them worth re-sending", () => {
    expect(transcribeFailure(402, { error: "trial_expired", message: "x" })).toEqual({
      error: "Your free trial has ended. Subscribe to keep making quotes.",
      retryable: false,
    });
    expect(transcribeFailure(403, { error: "ai_consent_required" }).error).toMatch(/OK to use AI/);
    expect(transcribeFailure(401, { error: "Unauthorized" }).error).toMatch(/signed out/);
    expect(transcribeFailure(429, { error: "rate_limited" }).error).toMatch(/today's voice notes/);
    expect(transcribeFailure(413, {}).error).toBe("That recording is too big to send. Keep it under 3 minutes.");
    expect(transcribeFailure(422, { error: "Could not detect any speech in the recording." })).toEqual({
      error: NO_WORDS,
      retryable: false,
    });
    expect(transcribeFailure(503, {}).error).toMatch(/aren't working right now/);
    for (const status of [401, 402, 403, 413, 422, 429, 503]) {
      expect(transcribeFailure(status, { error: status === 403 ? "ai_consent_required" : "" }).retryable).toBe(false);
    }
  });

  it("keeps the recording for a re-send when the service hiccups", () => {
    expect(transcribeFailure(502, { error: "Transcription failed. Please try again." })).toEqual({
      error: TRANSCRIBE_HICCUP,
      retryable: true,
    });
    expect(transcribeFailure(504, {}).retryable).toBe(true);
    expect(transcribeFailure(500, null).retryable).toBe(true);
  });

  it("passes on a sentence meant for people, never a code", () => {
    expect(transcribeFailure(415, { error: "Unsupported file type: text/plain" }).error).toBe(
      "Unsupported file type: text/plain",
    );
    expect(transcribeFailure(400, { error: "bad_request" }).error).toBe(
      "Something went wrong sending your recording (error 400). Record it again.",
    );
    expect(transcribeFailure(400, "<html>").error).toMatch(/error 400/);
  });
});

describe("the talk screen's words", () => {
  it("shows the clock as minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(42)).toBe("0:42");
    expect(formatClock(61.9)).toBe("1:01");
    expect(formatClock(180)).toBe("3:00");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("says what's happening at each step", () => {
    expect(talkStatus("idle", 0)).toEqual({
      status: "Tap the mic to start.",
      detail: "Sizes, materials, how long it'll take. Up to 3 minutes.",
    });
    expect(talkStatus("starting", 0).detail).toBe("If your phone asks, allow the microphone.");
    expect(talkStatus("recording", 42)).toEqual({ status: "I'm listening", detail: "Tap Done when you've finished." });
    expect(talkStatus("recording", 150).detail).toBe("30 seconds left");
    expect(talkStatus("recording", 175).detail).toBe("5 seconds left");
    expect(talkStatus("recording", 200).detail).toBe("0 seconds left");
    expect(talkStatus("paused", 10)).toEqual({ status: "Paused", detail: "Tap the mic to carry on." });
    expect(talkStatus("transcribing", 10).status).toBe("Writing down what you said…");
  });

  it("names the mic button by what a tap does", () => {
    expect(micButtonLabel("idle", false)).toBe("Start recording");
    expect(micButtonLabel("error", true)).toBe("Start recording");
    expect(micButtonLabel("recording", true)).toBe("Pause recording");
    expect(micButtonLabel("recording", false)).toBe("Stop recording");
    expect(micButtonLabel("paused", true)).toBe("Carry on recording");
    expect(micButtonLabel("transcribing", true)).toBe("Writing down what you said");
  });
});

describe("while the quote is started", () => {
  it("labels the big button and stays honest about the wait", () => {
    expect(writeButtonLabel("idle")).toBe("Write my quote");
    expect(writeButtonLabel("checking")).toBe("Checking the details…");
    expect(writeButtonLabel("saving")).toBe("Starting your quote…");
    expect(writeHint("idle", 0)).toBeUndefined();
    expect(writeHint("checking", 3)).toBe("Looking for anything I should ask you first.");
    expect(writeHint("checking", 10)).toBe("Still checking. This can take up to 30 seconds.");
    expect(writeHint("saving", 1)).toBe("Saving your job details.");
  });
});
