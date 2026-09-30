// The client's chat on the public quote page: who the assistant speaks for,
// the monogram, and the closed state (just the labelled button).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerChat, STARTER_QUESTIONS, initialsOf, welcomeMessage } from "./CustomerChat";

describe("CustomerChat", () => {
  it("greets the client by first name and says who it speaks for", () => {
    expect(welcomeMessage("STR8 BUILDERS", "Challis Samu")).toBe(
      "Hi Challis, I'm the quote assistant for STR8 BUILDERS. Ask me anything about this quote: what's included, timing, options or the terms. If I can't answer, I'll pass your question on to STR8 BUILDERS.",
    );
    expect(welcomeMessage(null, null)).toMatch(/^Hi, I'm the quote assistant for the team\. /);
    // No "T2Q" jargon for the client.
    expect(welcomeMessage("STR8 BUILDERS", null)).not.toMatch(/T2Q/);
  });

  it("makes a monogram from the business name", () => {
    expect(initialsOf("STR8 BUILDERS")).toBe("SB");
    expect(initialsOf("  kauri   joinery ltd")).toBe("KJ");
    expect(initialsOf("Āwhina Builders")).toBe("ĀB");
    expect(initialsOf("& co")).toBe("C");
    expect(initialsOf(null)).toBeNull();
    expect(initialsOf("  ")).toBeNull();
  });

  it("closed, it's one labelled button; the ready questions are a short list", () => {
    const html = renderToStaticMarkup(createElement(CustomerChat, { token: "t", businessName: "STR8 BUILDERS", clientName: "Challis" }));
    expect(html).toContain('data-testid="customer-chat-launcher"');
    expect(html).toContain("Ask about this quote");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="customer-chat-sheet"');
    expect(STARTER_QUESTIONS.length).toBeLessThanOrEqual(4);
  });
});
