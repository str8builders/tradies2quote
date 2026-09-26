import { describe, expect, it, vi } from "vitest";
import { answerPage, pageAnswerFromResponse, readPagesInTurn, type PageAnswer } from "./scanPages";

// The order of events when the AI reads a supplier document (quote scanner
// and price-list import): consent first in the iPhone app, a failed page
// kept apart from the pages that worked, and a run-wide stop.

const ok = (page: string): PageAnswer<string> => ({ ok: true, page });

describe("readPagesInTurn — AI consent", () => {
  it("asks for consent before the first page is sent, then reads", async () => {
    const events: string[] = [];
    const result = await readPagesInTurn({
      indexes: [0, 1],
      consentNeeded: true,
      askConsent: async () => {
        events.push("consent");
        return true;
      },
      read: async (i) => {
        events.push(`read ${i}`);
        return ok(`page ${i}`);
      },
    });
    expect(events).toEqual(["consent", "read 0", "read 1"]);
    expect(result.outcomes.map((o) => o.ok)).toEqual([true, true]);
  });

  it("sends nothing when the tradie doesn't agree", async () => {
    const read = vi.fn();
    const result = await readPagesInTurn({ indexes: [0], consentNeeded: true, askConsent: async () => false, read });
    expect(result).toEqual({ outcomes: [], declined: true });
    expect(read).not.toHaveBeenCalled();
  });

  it("on the web (no consent needed) never asks", async () => {
    const askConsent = vi.fn();
    await readPagesInTurn({ indexes: [0], consentNeeded: false, askConsent, read: async () => ok("p") });
    expect(askConsent).not.toHaveBeenCalled();
  });

  it("when the server asks for consent mid-run, asks the tradie and tries that page again", async () => {
    const read = vi
      .fn<(i: number) => Promise<PageAnswer<string>>>()
      .mockResolvedValueOnce({ ok: false, status: 403, code: "ai_consent_required", error: "Turn on AI features" })
      .mockResolvedValueOnce(ok("page 0"));
    const askConsent = vi.fn(async () => true);
    const result = await readPagesInTurn({ indexes: [0], consentNeeded: false, askConsent, read });
    expect(askConsent).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.outcomes).toEqual([{ index: 0, ok: true, page: "page 0" }]);
  });
});

describe("readPagesInTurn — pages that fail", () => {
  it("keeps the pages that worked when one fails", async () => {
    const result = await readPagesInTurn({
      indexes: [0, 1, 2],
      consentNeeded: false,
      askConsent: async () => true,
      read: async (i) => (i === 1 ? { ok: false, status: 502, error: "Quote scan failed. Please try again." } : ok(`page ${i}`)),
    });
    expect(result.outcomes).toEqual([
      { index: 0, ok: true, page: "page 0" },
      { index: 1, ok: false, error: "Quote scan failed. Please try again." },
      { index: 2, ok: true, page: "page 2" },
    ]);
  });

  it("stops at an answer that applies to every page (new quotes paused)", async () => {
    const read = vi.fn(async () => ({ ok: false as const, status: 402, error: "New quotes are paused on this account." }));
    const result = await readPagesInTurn({ indexes: [0, 1, 2], consentNeeded: false, askConsent: async () => true, read });
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.outcomes.map((o) => (o.ok ? "ok" : o.error))).toEqual([
      "New quotes are paused on this account.",
      "New quotes are paused on this account.",
      "New quotes are paused on this account.",
    ]);
  });
});

describe("pageAnswerFromResponse", () => {
  it("prefers the plain message and keeps the error code", async () => {
    const res = new Response(JSON.stringify({ error: "trial_expired", message: "New quotes are paused on this account." }), { status: 402 });
    expect(await pageAnswerFromResponse(res)).toEqual({
      ok: false,
      status: 402,
      code: "trial_expired",
      error: "New quotes are paused on this account.",
    });
  });
});

describe("answerPage", () => {
  it("a dropped connection fails only that page", async () => {
    const answer = await answerPage(async () => {
      throw new Error("The upload failed. Your files are still selected; try again.");
    });
    expect(answer).toEqual({ ok: false, status: 0, error: "The upload failed. Your files are still selected; try again." });
  });

  it("a cancel still stops the run", async () => {
    await expect(
      answerPage(async () => {
        throw new DOMException("Scan cancelled.", "AbortError");
      }),
    ).rejects.toThrow("Scan cancelled.");
  });
});
