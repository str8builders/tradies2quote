import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushToUser: (...a: unknown[]) => state.push(...a) }));

import {
  CHAT_PUSH_GAP_MS,
  clientMessagePush,
  firstViewFromRpc,
  pushInBackground,
  quoteOpenedPush,
  takeChatPushSlot,
} from "./quote-activity-push";

const quote = (overrides: Record<string, unknown> = {}) => ({
  id: "12345678-aaaa-4bbb-8ccc-999999999999",
  created_at: "2026-09-20T00:00:00Z",
  client: { name: "Sam Taylor" },
  job_summary: "New kwila deck at 14 Rata St — remove the old one first.",
  ...overrides,
});

beforeEach(() => {
  state.push.mockReset().mockResolvedValue(undefined);
});

describe("the buzz when the client opens the quote", () => {
  it("names the client and the job", () => {
    expect(quoteOpenedPush(quote())).toEqual({
      title: "Sam opened your quote",
      body: "New kwila deck at 14 Rata St",
      url: "/app/quotes/preview/12345678-aaaa-4bbb-8ccc-999999999999",
      tag: "quote-opened-12345678-aaaa-4bbb-8ccc-999999999999",
    });
  });

  it("falls back to 'Your client' and the quote number", () => {
    const payload = quoteOpenedPush(quote({ client: { name: "To be confirmed" }, job_summary: "" }));
    expect(payload.title).toBe("Your client opened your quote");
    expect(payload.body).toBe("Quote Q-2026-1234");
  });
});

describe("the buzz when the client sends a message", () => {
  it("says what they wrote, on one line and cut short", () => {
    const payload = clientMessagePush(quote(), `Can you\nstart\tsoon? ${"really ".repeat(30)}`);
    expect(payload.title).toBe("Sam sent a message");
    expect(payload.body.startsWith("Can you start soon? really")).toBe(true);
    expect(payload.body.length).toBeLessThanOrEqual(100);
    expect(payload.body).not.toMatch(/[\n\t]/);
    expect(payload.tag).toBe("quote-chat-12345678-aaaa-4bbb-8ccc-999999999999");
  });

  it("at most one per quote per 15 minutes", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-28T10:00:00.000Z") });
    try {
      expect(CHAT_PUSH_GAP_MS).toBe(15 * 60_000);
      expect(takeChatPushSlot("slot-quote")).toBe(true);
      expect(takeChatPushSlot("slot-quote")).toBe(false);
      expect(takeChatPushSlot("another-quote")).toBe(true);
      vi.setSystemTime(new Date("2026-09-28T10:15:00.001Z"));
      expect(takeChatPushSlot("slot-quote")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("firstViewFromRpc", () => {
  it("only the call that recorded the first view names the owner", () => {
    expect(firstViewFromRpc({ quote_id: "q", user_id: "u" })).toEqual({ quoteId: "q", userId: "u" });
    // Later views, and the function before its migration (returns nothing).
    for (const nothing of [null, undefined, "", {}, { quote_id: "q" }, [], 42]) {
      expect(firstViewFromRpc(nothing)).toBeNull();
    }
  });
});

describe("pushInBackground", () => {
  it("never waits for, or fails on, the push", async () => {
    state.push.mockReturnValue(new Promise(() => {}));
    expect(() => pushInBackground("u", { title: "t", body: "b" })).not.toThrow();
    state.push.mockRejectedValue(new Error("down"));
    expect(() => pushInBackground("u", { title: "t", body: "b" })).not.toThrow();
    state.push.mockImplementation(() => {
      throw new Error("sync throw");
    });
    expect(() => pushInBackground("u", { title: "t", body: "b" })).not.toThrow();
    await Promise.resolve();
    expect(state.push).toHaveBeenCalledTimes(3);
  });
});
