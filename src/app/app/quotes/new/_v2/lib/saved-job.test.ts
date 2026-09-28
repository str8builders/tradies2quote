import { describe, expect, it, vi } from "vitest";
import {
  SAVED_JOB_KEY,
  SAVED_JOB_MAX_AGE_MS,
  SAVED_RECORDING_KEY,
  base64ToBlob,
  blobToBase64,
  forgetRecording,
  forgetSentJob,
  forgetWords,
  keepWords,
  parseSavedJob,
  parseSavedRecording,
  readRecording,
  readWords,
  recordingBackup,
  rememberRecording,
  rememberWords,
  sessionStore,
  type StorageLike,
} from "./saved-job";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const blocked: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("keeping the words until the draft quote exists", () => {
  it("keeps the words on every change and gives them back on any load, again and again", () => {
    const storage = memoryStorage();
    keepWords(storage, { channel: "talk", text: "Deck 6 by 4" }, 1_000);
    expect(readWords(storage, 2_000)).toEqual({ channel: "talk", text: "Deck 6 by 4", at: 1_000 });
    // A second reload puts them back too: reading never clears.
    expect(readWords(storage, 3_000)).toEqual({ channel: "talk", text: "Deck 6 by 4", at: 1_000 });
    keepWords(storage, { channel: "talk", text: "Deck 6 by 4, kwila" }, 4_000);
    expect(readWords(storage, 5_000)?.text).toBe("Deck 6 by 4, kwila");
  });

  it("clearing the words forgets them", () => {
    const storage = memoryStorage();
    keepWords(storage, { channel: "type", text: "Fence" }, 1);
    keepWords(storage, { channel: "type", text: "   " }, 2);
    expect(storage.data.has(SAVED_JOB_KEY)).toBe(false);
    keepWords(storage, { channel: "type", text: "Fence" }, 1);
    keepWords(storage, null, 2);
    expect(storage.data.size).toBe(0);
  });

  it("the quote page clears words once they were sent, and leaves words still being typed", () => {
    const storage = memoryStorage();
    keepWords(storage, { channel: "type", text: "Fence 20 m" }, 1_000);
    rememberRecording(storage, { type: "audio/webm", data: "AAAA", at: 1_000 });
    expect(forgetSentJob(storage, 2_000)).toBe(false);
    expect(readWords(storage, 2_000)?.text).toBe("Fence 20 m");

    keepWords(storage, { channel: "type", text: "Fence 20 m" }, 3_000, true);
    expect(readWords(storage, 3_000)).toMatchObject({ submitted: true });
    expect(forgetSentJob(storage, 4_000)).toBe(true);
    expect(storage.data.size).toBe(0);
  });

  it("stale words are forgotten, never put back", () => {
    const storage = memoryStorage();
    keepWords(storage, { channel: "type", text: "Fence" }, 0);
    expect(readWords(storage, SAVED_JOB_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.data.has(SAVED_JOB_KEY)).toBe(false);
    expect(readWords(storage, 0)).toBeNull();
  });

  it("never brings back broken words", () => {
    expect(parseSavedJob(JSON.stringify({ channel: "type", text: "x", at: 10 * 60_000 }), 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "fax", text: "x", at: 0 }), 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "type", text: "  ", at: 0 }), 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "type", text: "x" }), 0)).toBeNull();
    expect(parseSavedJob("{not json", 0)).toBeNull();
    expect(parseSavedJob("null", 0)).toBeNull();
    expect(parseSavedJob(null, 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "scan", text: "Framing", at: 5, submitted: "yes" }), 60_000)).toEqual({
      channel: "scan",
      text: "Framing",
      at: 5,
    });
  });

  it("carries on quietly when storage is blocked or missing", () => {
    expect(() => keepWords(blocked, { channel: "type", text: "Fence" }, 1)).not.toThrow();
    expect(() => rememberWords(blocked, { channel: "type", text: "Fence", at: 1 })).not.toThrow();
    expect(() => forgetWords(blocked)).not.toThrow();
    expect(readWords(blocked, 1)).toBeNull();
    expect(forgetSentJob(blocked, 1)).toBe(false);
    expect(() => keepWords(null, { channel: "type", text: "Fence" }, 1)).not.toThrow();
    expect(readWords(null, 1)).toBeNull();
    expect(sessionStore()).toBeNull();
  });
});

describe("keeping a recording that isn't written down yet", () => {
  const audio = () => new Blob([new Uint8Array([0, 1, 2, 250, 251, 252, 255])], { type: "audio/webm" });

  it("round-trips the audio through text", async () => {
    const data = await blobToBase64(audio());
    const back = base64ToBlob(data, "audio/webm");
    expect(back?.type).toBe("audio/webm");
    expect(Array.from(new Uint8Array(await back!.arrayBuffer()))).toEqual([0, 1, 2, 250, 251, 252, 255]);
    expect(base64ToBlob("%%% not base64", "audio/webm")).toBeNull();
  });

  it("the recorder's copy: kept while fresh, forgotten once written down", async () => {
    const storage = memoryStorage();
    let now = 1_000;
    const backup = recordingBackup(() => storage, () => now);
    await backup({ blob: audio(), type: "audio/webm" });
    const kept = readRecording(storage, 2_000);
    expect(kept).toMatchObject({ type: "audio/webm", at: 1_000 });
    expect(kept!.data).toBe(await blobToBase64(audio()));
    now = 5_000;
    await backup(null);
    expect(storage.data.has(SAVED_RECORDING_KEY)).toBe(false);
  });

  it("only the newest recording's copy is written", async () => {
    const storage = memoryStorage();
    const backup = recordingBackup(() => storage, () => 1);
    const first = backup({ blob: audio(), type: "audio/webm" });
    const cleared = backup(null);
    await Promise.all([first, cleared]);
    expect(storage.data.has(SAVED_RECORDING_KEY)).toBe(false);
  });

  it("a recording too big for storage is simply not kept", async () => {
    const full: StorageLike = { ...memoryStorage(), setItem: vi.fn(() => { throw new Error("QuotaExceededError"); }) };
    const backup = recordingBackup(() => full, () => 1);
    await expect(backup({ blob: audio(), type: "audio/mp4" })).resolves.toBeUndefined();
    expect(readRecording(full, 1)).toBeNull();
  });

  it("stale or broken recordings never come back", () => {
    const storage = memoryStorage();
    rememberRecording(storage, { type: "audio/webm", data: "AAAA", at: 0 });
    expect(readRecording(storage, SAVED_JOB_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.data.has(SAVED_RECORDING_KEY)).toBe(false);
    expect(parseSavedRecording(JSON.stringify({ type: "text/html", data: "AAAA", at: 0 }), 0)).toBeNull();
    expect(parseSavedRecording(JSON.stringify({ type: "audio/mp4", data: "", at: 0 }), 0)).toBeNull();
    expect(parseSavedRecording("{", 0)).toBeNull();
    expect(() => forgetRecording(blocked)).not.toThrow();
    expect(readRecording(blocked, 0)).toBeNull();
  });
});
