import { describe, expect, it } from "vitest";
import { photoPlanErrorMessage, photoPlanNetworkErrorMessage } from "./photoPlanErrors";

describe("photoPlanErrorMessage — no raw codes on screen", () => {
  it("maps trial_expired to a plain sentence (never the code itself)", () => {
    expect(photoPlanErrorMessage(402, { error: "trial_expired" })).toBe(
      "Your free trial has ended. Subscribe to keep using photo reading.",
    );
    expect(
      photoPlanErrorMessage(402, { error: "trial_expired", message: "Your free trial has ended. Subscribe to keep using photo analysis." }),
    ).toBe("Your free trial has ended. Subscribe to keep using photo analysis.");
  });

  it("maps the consent gate and the daily limit", () => {
    expect(photoPlanErrorMessage(403, { error: "ai_consent_required" })).toMatch(/Turn on AI features/);
    expect(photoPlanErrorMessage(429, { error: "rate_limited" })).toMatch(/today's limit/);
    expect(photoPlanErrorMessage(429, null)).toMatch(/today's limit/);
  });

  it("replaces technical upstream text with plain messages", () => {
    for (const [status, body] of [
      [502, { error: "OpenAI 500: boom" }],
      [503, { error: "Photo plan agent is not configured (OPENAI_API_KEY)" }],
      [400, { error: "Expected multipart/form-data with an 'image' field." }],
      [415, { error: "Unsupported or unreadable image file." }],
      [413, null],
    ] as const) {
      const msg = photoPlanErrorMessage(status, body);
      expect(msg).not.toMatch(/_|OpenAI|multipart|OPENAI_API_KEY/);
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("words network failures plainly", () => {
    const timeout = new DOMException("signal timed out", "TimeoutError");
    expect(photoPlanNetworkErrorMessage(timeout)).toMatch(/took too long/);
    expect(photoPlanNetworkErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Couldn't reach the server/);
    expect(photoPlanNetworkErrorMessage(new SyntaxError("Unexpected token <"))).not.toMatch(/token/);
  });
});
