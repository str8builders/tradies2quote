import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_WORDS, TRANSCRIBE_HICCUP, TRANSCRIBE_OFFLINE, TRANSCRIBE_TOO_SLOW } from "./copy";
import { TRANSCRIBE_TIMEOUT_MS, anySignal, audioFileName, transcribeRecording } from "./transcribe";

const audio = () => new Blob(["voice"], { type: "audio/webm" });
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe("the request (same as the current flow)", () => {
  it("posts the recording as a multipart 'audio' file with a 90 second limit", async () => {
    expect(TRANSCRIBE_TIMEOUT_MS).toBe(90_000);
    const fetchImpl = reply(200, { transcript: "Deck 6 by 4" });
    await transcribeRecording(audio(), "audio/webm;codecs=opus", new AbortController().signal, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/quotes/transcribe");
    expect(init.method).toBe("POST");
    const file = (init.body as FormData).get("audio") as File;
    expect(file.name).toBe("recording.webm");
    expect(file.type).toBe("audio/webm;codecs=opus");
    expect(await file.text()).toBe("voice");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("names the file for the recording's format", () => {
    expect(audioFileName("audio/mp4")).toBe("recording.m4a");
    expect(audioFileName("audio/ogg;codecs=opus")).toBe("recording.ogg");
    expect(audioFileName("audio/webm")).toBe("recording.webm");
    expect(audioFileName("")).toBe("recording.webm");
  });
});

describe("the answer, in plain words", () => {
  const signal = () => new AbortController().signal;

  it("hands back the trimmed words", async () => {
    const fetchImpl = reply(200, { transcript: "  Deck 6 by 4  " }) as unknown as typeof fetch;
    expect(await transcribeRecording(audio(), "audio/webm", signal(), fetchImpl)).toEqual({
      ok: true,
      transcript: "Deck 6 by 4",
    });
  });

  it("no words heard is not worth re-sending", async () => {
    for (const body of [{ transcript: "   " }, { transcript: 42 }, {}]) {
      const fetchImpl = reply(200, body) as unknown as typeof fetch;
      expect(await transcribeRecording(audio(), "audio/webm", signal(), fetchImpl)).toEqual({
        ok: false,
        error: NO_WORDS,
        retryable: false,
      });
    }
  });

  it("maps a refusal through the plain-words table", async () => {
    const trial = reply(402, { error: "trial_expired", message: "x" }) as unknown as typeof fetch;
    expect(await transcribeRecording(audio(), "audio/webm", signal(), trial)).toMatchObject({
      ok: false,
      retryable: false,
      error: "Your free trial has ended. Subscribe to keep making quotes.",
    });
    const flaky = reply(502, { error: "Transcription failed. Please try again." }) as unknown as typeof fetch;
    expect(await transcribeRecording(audio(), "audio/webm", signal(), flaky)).toEqual({
      ok: false,
      error: TRANSCRIBE_HICCUP,
      retryable: true,
    });
    const htmlError = reply(500, "<html>oops</html>") as unknown as typeof fetch;
    expect(await transcribeRecording(audio(), "audio/webm", signal(), htmlError)).toMatchObject({ retryable: true });
  });

  it("a garbled success is a hiccup worth re-sending", async () => {
    const fetchImpl = reply(200, "<html>") as unknown as typeof fetch;
    expect(await transcribeRecording(audio(), "audio/webm", signal(), fetchImpl)).toEqual({
      ok: false,
      error: TRANSCRIBE_HICCUP,
      retryable: true,
    });
  });

  it("no connection keeps the recording for another go", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await transcribeRecording(audio(), "audio/webm", signal(), offline)).toEqual({
      ok: false,
      error: TRANSCRIBE_OFFLINE,
      retryable: true,
    });
  });

  it("too slow says so, and keeps the recording", async () => {
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError")));
        }),
    ) as unknown as typeof fetch;
    expect(await transcribeRecording(audio(), "audio/webm", signal(), hang, 5)).toEqual({
      ok: false,
      error: TRANSCRIBE_TOO_SLOW,
      retryable: true,
    });
  });

  it("a send cancelled by the screen (Back, unmount) is quietly dropped", async () => {
    const controller = new AbortController();
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    ) as unknown as typeof fetch;
    const pending = transcribeRecording(audio(), "audio/webm", controller.signal, hang);
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: "", retryable: false, aborted: true });
  });
});

describe("anySignal", () => {
  it("aborts when any of its signals does, with or without AbortSignal.any", () => {
    const native = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    for (const withNative of [true, false]) {
      if (!withNative) Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
      try {
        const a = new AbortController();
        const b = new AbortController();
        const combined = anySignal([a.signal, b.signal]);
        expect(combined.aborted).toBe(false);
        b.abort();
        expect(combined.aborted).toBe(true);
        const already = new AbortController();
        already.abort();
        expect(anySignal([already.signal, a.signal]).aborted).toBe(true);
      } finally {
        if (native) Object.defineProperty(AbortSignal, "any", native);
      }
    }
    expect(typeof AbortSignal.any).toBe("function");
  });
});
