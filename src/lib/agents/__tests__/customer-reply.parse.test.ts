import { describe, expect, it } from "vitest";
import { parseCustomerReply } from "../customer-reply";

describe("parseCustomerReply (tool-input normalisation)", () => {
  it("passes a valid reply through", () => {
    const res = parseCustomerReply({
      intent: "wants_cheaper_price",
      confidence: 0.9,
      reasoning: "Pushing on price",
      replyDraft: "Cheers, here's how the price was built…",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.intent).toBe("wants_cheaper_price");
    expect(res.value.confidence).toBe(0.9);
    expect(res.value.replyDraft).toContain("Cheers");
  });

  it("clamps an unknown intent to general_question", () => {
    const res = parseCustomerReply({ intent: "made_up", replyDraft: "hi" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.intent).toBe("general_question");
  });

  it("defaults out-of-range / missing confidence to 0.5", () => {
    expect((parseCustomerReply({ confidence: 5, replyDraft: "x" }) as { value: { confidence: number } }).value.confidence).toBe(0.5);
    expect((parseCustomerReply({ replyDraft: "x" }) as { value: { confidence: number } }).value.confidence).toBe(0.5);
  });

  it("falls back to a safe placeholder when the draft is empty", () => {
    const res = parseCustomerReply({ intent: "accepts_quote", replyDraft: "" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.replyDraft).toMatch(/empty/i);
  });
});

describe("parseCustomerReply — dollar figures (money guard)", () => {
  const allowed = [12204.46, 11000]; // the quote total + the customer's "$11k"

  it("sends back a draft that works out a new figure, naming it", () => {
    const res = parseCustomerReply(
      { intent: "wants_cheaper_price", replyDraft: "There's not a lot of fat in there to shave $1,200 off." },
      allowed,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/\$1,200, which is not on the quote/);
  });

  it("the total and the customer's own amount are fine", () => {
    const res = parseCustomerReply(
      { intent: "wants_cheaper_price", replyDraft: "The $12,204.46 is built off real costs, so I can't do $11,000." },
      allowed,
    );
    expect(res.ok).toBe(true);
  });

  it("without allowed amounts nothing is checked", () => {
    expect(parseCustomerReply({ replyDraft: "About $1,200 less." }).ok).toBe(true);
  });
});
