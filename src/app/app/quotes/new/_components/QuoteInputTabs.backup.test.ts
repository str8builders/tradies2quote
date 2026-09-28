// The classic new-quote tabs keep the tradie's words the way the new look
// does (lib/saved-job: kept in this tab on every change, put back on any
// load, cleared once the draft exists), and a voice note that fails to send
// is kept for "Try again" (the new look's recorder), not thrown away.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ createDraftQuote: async () => undefined }));
vi.mock("../ai-consent-actions", () => ({ recordAiConsentAction: async () => ({ ok: true }) }));

import { classicVoiceState, keptTabWords, tabWordsReducer, type TabWords } from "./QuoteInputTabs";

const START: TabWords = { tab: "voice", texts: { talk: "", type: "", scan: "" }, loaded: false };
const DECK = "Deck 6 m by 4 m off the back door, kwila boards";

describe("the classic tabs' words", () => {
  it("puts kept words back once, on the tab they came from", () => {
    const talk = tabWordsReducer(START, { type: "loaded", saved: { channel: "talk", text: DECK }, voiceEnabled: true });
    expect(talk).toEqual({ tab: "voice", texts: { talk: DECK, type: "", scan: "" }, loaded: true });
    expect(tabWordsReducer(talk, { type: "loaded", saved: { channel: "type", text: "x" }, voiceEnabled: true })).toBe(talk);
    // Plan-scan words, or spoken words with voice off, come back as typed words.
    for (const saved of [
      { channel: "scan" as const, text: DECK },
      { channel: "talk" as const, text: DECK },
    ]) {
      const typed = tabWordsReducer(START, { type: "loaded", saved, voiceEnabled: saved.channel === "scan" });
      expect(typed).toMatchObject({ tab: "type", texts: { type: DECK }, loaded: true });
    }
    expect(tabWordsReducer(START, { type: "loaded", saved: null, voiceEnabled: true })).toEqual({ ...START, loaded: true });
  });

  it("keeps the active tab's words, else another tab's", () => {
    expect(keptTabWords(START)).toBeNull();
    const typed = tabWordsReducer({ ...START, tab: "type" }, { type: "text", channel: "type", text: DECK });
    expect(keptTabWords(typed)).toEqual({ channel: "type", text: DECK });
    expect(keptTabWords(tabWordsReducer(typed, { type: "tab", tab: "scan" }))).toEqual({ channel: "type", text: DECK });
    const spoken = tabWordsReducer(typed, { type: "text", channel: "talk", text: "Fence 20 m" });
    expect(keptTabWords(tabWordsReducer(spoken, { type: "tab", tab: "voice" }))).toEqual({ channel: "talk", text: "Fence 20 m" });
  });

  it("changes nothing for the same words or tab", () => {
    expect(tabWordsReducer(START, { type: "tab", tab: "voice" })).toBe(START);
    expect(tabWordsReducer(START, { type: "text", channel: "talk", text: "" })).toBe(START);
  });
});

describe("the classic voice panel on the new recorder", () => {
  it("shows the recorder's phases in the panel's four looks", () => {
    expect(classicVoiceState("idle")).toBe("idle");
    expect(classicVoiceState("starting")).toBe("idle");
    expect(classicVoiceState("recording")).toBe("recording");
    expect(classicVoiceState("paused")).toBe("recording");
    expect(classicVoiceState("transcribing")).toBe("processing");
    expect(classicVoiceState("review")).toBe("idle");
    expect(classicVoiceState("error")).toBe("error");
  });

  it("Try again sends a kept recording again, and a sent job is marked for the quote page", () => {
    const code = readFileSync(join(__dirname, "QuoteInputTabs.tsx"), "utf8");
    expect(code).toContain("useVoiceRecorder(setTranscript)");
    expect(code).toMatch(/function retry\(\) \{\s*if \(rec\.canResend\) recorder\.resend\(\);\s*else recorder\.reset\(\);/);
    expect(code).toContain("onClick={retry}");
    expect(code).not.toContain("new MediaRecorder(");
    expect(code).toContain("keepWords(sessionStore(), kept, Date.now(), true);");
  });
});
