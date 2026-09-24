import { describe, expect, it } from "vitest";
import {
  SAVED_JOB_KEY,
  SAVED_JOB_MAX_AGE_MS,
  forgetWords,
  parseSavedJob,
  rememberWords,
  sessionStore,
  takeWords,
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

describe("keeping the words through a failed save", () => {
  it("gives the words back once, then forgets them", () => {
    const storage = memoryStorage();
    rememberWords(storage, { channel: "talk", text: "Deck 6 by 4", at: 1_000 });
    expect(storage.data.has(SAVED_JOB_KEY)).toBe(true);
    expect(takeWords(storage, 2_000)).toEqual({ channel: "talk", text: "Deck 6 by 4", at: 1_000 });
    expect(takeWords(storage, 2_000)).toBeNull();
  });

  it("never brings back stale or broken words", () => {
    expect(parseSavedJob(JSON.stringify({ channel: "type", text: "x", at: 0 }), SAVED_JOB_MAX_AGE_MS + 1)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "type", text: "x", at: 10 * 60_000 }), 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "fax", text: "x", at: 0 }), 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "type", text: "  ", at: 0 }), 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "type", text: "x" }), 0)).toBeNull();
    expect(parseSavedJob("{not json", 0)).toBeNull();
    expect(parseSavedJob("null", 0)).toBeNull();
    expect(parseSavedJob(null, 0)).toBeNull();
    expect(parseSavedJob(JSON.stringify({ channel: "scan", text: "Framing", at: 5 }), 60_000)).toEqual({
      channel: "scan",
      text: "Framing",
      at: 5,
    });
  });

  it("clears leftovers on any other visit", () => {
    const storage = memoryStorage();
    rememberWords(storage, { channel: "type", text: "Fence", at: 1 });
    forgetWords(storage);
    expect(storage.data.size).toBe(0);
  });

  it("carries on quietly when storage is blocked or missing", () => {
    expect(() => rememberWords(blocked, { channel: "type", text: "Fence", at: 1 })).not.toThrow();
    expect(() => forgetWords(blocked)).not.toThrow();
    expect(takeWords(blocked, 1)).toBeNull();
    expect(() => rememberWords(null, { channel: "type", text: "Fence", at: 1 })).not.toThrow();
    expect(takeWords(null, 1)).toBeNull();
    expect(sessionStore()).toBeNull();
  });
});
