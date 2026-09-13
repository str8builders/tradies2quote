import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/runtime", () => ({ runStructuredAgent: vi.fn() }));

import { parseQuestions, suggestClarifyingQuestions } from "../questions";

describe("parseQuestions", () => {
  it("keeps up to three clean questions", () => {
    const r = parseQuestions({
      questions: [
        "  Roughly how long   is the fence? ",
        "x",
        42,
        "Is the old fence to be removed and dumped?",
        "Timber or metal posts?",
        "A fourth question that should be dropped?",
      ],
    });
    expect(r).toEqual({
      ok: true,
      value: [
        "Roughly how long is the fence?",
        "Is the old fence to be removed and dumped?",
        "Timber or metal posts?",
      ],
    });
  });

  it("rejects a payload without an array", () => {
    expect(parseQuestions({ questions: "no" }).ok).toBe(false);
    expect(parseQuestions(null).ok).toBe(false);
  });
});

describe("suggestClarifyingQuestions", () => {
  it("returns the runner's questions for a real description", async () => {
    const runner = vi.fn(async () => ["How long is the fence?", "Remove the old one?"]);
    const q = await suggestClarifyingQuestions("Replace the old timber fence along the driveway, 1.8 high.", runner);
    expect(q).toEqual(["How long is the fence?", "Remove the old one?"]);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("skips the model for short descriptions", async () => {
    const runner = vi.fn(async () => ["?"]);
    expect(await suggestClarifyingQuestions("fix fence", runner)).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("never throws when the model is unavailable", async () => {
    const runner = vi.fn(async () => {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    });
    expect(await suggestClarifyingQuestions("Replace the old timber fence along the driveway, 1.8 high.", runner)).toEqual([]);
  });
});
