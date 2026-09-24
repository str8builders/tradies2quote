import { describe, expect, it, vi } from "vitest";
import type { Clarification } from "@/lib/clarifications";
import {
  CLEANUP_TIMEOUT_MS,
  MAX_RECORDING_SECONDS,
  MIN_TYPED_LENGTH,
  appendAnswersToTranscript,
  pickMimeType,
  requestClarifications,
} from "./quote-input";

const Q = (id: string, question: string, options: string[] = []): Clarification => ({
  id,
  question,
  why: "",
  options,
  source: "regex",
});

describe("shared limits", () => {
  it("keeps the rules both looks rely on", () => {
    expect(MAX_RECORDING_SECONDS).toBe(180);
    expect(MIN_TYPED_LENGTH).toBe(20);
    expect(CLEANUP_TIMEOUT_MS).toBe(30_000);
  });
});

describe("pickMimeType", () => {
  it("takes the first supported format, in order of preference", () => {
    expect(pickMimeType({ isTypeSupported: () => true })).toBe("audio/webm;codecs=opus");
    expect(pickMimeType({ isTypeSupported: (t) => t === "audio/mp4" })).toBe("audio/mp4");
    expect(pickMimeType({ isTypeSupported: () => false })).toBeUndefined();
  });

  it("uses the browser default when there is no MediaRecorder", () => {
    expect(typeof MediaRecorder).toBe("undefined");
    expect(pickMimeType()).toBeUndefined();
  });
});

describe("appendAnswersToTranscript", () => {
  const questions = [Q("gib.1", "Which GIB?", ["GIB Standard 10mm"]), Q("missing.0", "How high is the fence?")];

  it("adds answered questions as a labelled block, in answer order", () => {
    expect(
      appendAnswersToTranscript("Fence 20 m", questions, [
        { questionId: "missing.0", answer: "1.8 m" },
        { questionId: "gib.1", answer: "GIB Standard 10mm" },
      ]),
    ).toBe(
      "Fence 20 m\n\n[Additional details confirmed by the tradie:]\n- How high is the fence? → 1.8 m\n- Which GIB? → GIB Standard 10mm",
    );
  });

  it("leaves the text alone when everything was skipped or unknown", () => {
    expect(
      appendAnswersToTranscript("Fence 20 m", questions, [
        { questionId: "gib.1", answer: null },
        { questionId: "nope", answer: "x" },
      ]),
    ).toBe("Fence 20 m");
    expect(appendAnswersToTranscript("Fence 20 m", questions, [])).toBe("Fence 20 m");
  });
});

describe("requestClarifications", () => {
  const ok = (body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it("posts the job text to the clean-up route with a time limit", async () => {
    const fetchImpl = ok({ questions: [Q("a", "Which GIB?")] });
    const questions = await requestClarifications("Deck 6 by 4", fetchImpl);
    expect(questions.map((q) => q.id)).toEqual(["a"]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/quotes/cleanup");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ transcript: "Deck 6 by 4" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats every failure as no questions, so the quote still starts", async () => {
    expect(await requestClarifications("x", ok({ questions: [] }))).toEqual([]);
    expect(await requestClarifications("x", ok({ questions: "nope" }))).toEqual([]);
    expect(await requestClarifications("x", ok({}))).toEqual([]);
    const refused = vi.fn(async () => new Response("{}", { status: 402 })) as unknown as typeof fetch;
    expect(await requestClarifications("x", refused)).toEqual([]);
    const garbled = vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    expect(await requestClarifications("x", garbled)).toEqual([]);
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await requestClarifications("x", offline)).toEqual([]);
  });
});
