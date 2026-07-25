import { describe, expect, it } from "vitest";
import { classifyPublicQuote, isRichPreviewEligible } from "./quote-public-view";

/**
 * Locks the exact public-page semantics that the 2026-07-17 outage turned on.
 * The star case: `draft` (with a token) must classify as `not_live` — NOT
 * `live` — so an unsent quote never leaks publicly; and the send flow, not
 * this guard, is what must flip a texted quote to `sent`.
 */

const NOW = new Date("2026-07-17T12:00:00Z");
const future = "2026-12-31T00:00:00Z";
const past = "2026-01-01T00:00:00Z";

describe("classifyPublicQuote", () => {
  it("draft with a live expiry → not_live (the outage's home)", () => {
    expect(classifyPublicQuote({ status: "draft", expires_at: future }, NOW)).toEqual({
      kind: "not_live",
      status: "draft",
    });
  });

  it("sent → live", () => {
    expect(classifyPublicQuote({ status: "sent", expires_at: future }, NOW)).toEqual({
      kind: "live",
    });
  });

  it("viewed → live", () => {
    expect(classifyPublicQuote({ status: "viewed", expires_at: future }, NOW)).toEqual({
      kind: "live",
    });
  });

  it.each(["accepted", "scheduled", "in_progress", "completed"])(
    "%s → accepted",
    (status) => {
      expect(classifyPublicQuote({ status, expires_at: future }, NOW)).toEqual({
        kind: "accepted",
      });
    },
  );

  it("declined → unavailable", () => {
    expect(classifyPublicQuote({ status: "declined", expires_at: future }, NOW)).toEqual({
      kind: "unavailable",
    });
  });

  it("expired status → expired", () => {
    expect(classifyPublicQuote({ status: "expired", expires_at: future }, NOW)).toEqual({
      kind: "expired",
    });
  });

  it("any status past its expires_at → expired", () => {
    expect(classifyPublicQuote({ status: "sent", expires_at: past }, NOW)).toEqual({
      kind: "expired",
    });
  });

  it("declined-AND-expired → unavailable (tradie action wins over expiry)", () => {
    expect(classifyPublicQuote({ status: "declined", expires_at: past }, NOW)).toEqual({
      kind: "unavailable",
    });
  });

  it("accepted-like wins even when past expiry", () => {
    expect(classifyPublicQuote({ status: "accepted", expires_at: past }, NOW)).toEqual({
      kind: "accepted",
    });
  });

  it("null expires_at never counts as expired", () => {
    expect(classifyPublicQuote({ status: "sent", expires_at: null }, NOW)).toEqual({
      kind: "live",
    });
  });

  it("an unknown future status → not_live (fails safe, never leaks)", () => {
    expect(classifyPublicQuote({ status: "something_new", expires_at: future }, NOW)).toEqual({
      kind: "not_live",
      status: "something_new",
    });
  });
});

/**
 * The link-preview leak guard. The unfurl card (OG title/description +
 * opengraph-image) may show the business name + total ONLY for quotes the page
 * body renders in full — otherwise a draft/declined/expired quote's figures
 * leak via the in-band meta tags for a page that shows "not found". Keep these
 * in lockstep with the body's render branches above.
 */
describe("isRichPreviewEligible", () => {
  it("live (sent/viewed) and accepted-like are eligible for the rich card", () => {
    for (const status of ["sent", "viewed", "accepted", "scheduled", "in_progress", "completed"]) {
      expect(
        isRichPreviewEligible({ status, expires_at: future }, NOW),
        status,
      ).toBe(true);
    }
  });

  it("draft/declined/expired/unknown are NOT eligible — card stays neutral", () => {
    expect(isRichPreviewEligible({ status: "draft", expires_at: future }, NOW)).toBe(false);
    expect(isRichPreviewEligible({ status: "declined", expires_at: future }, NOW)).toBe(false);
    expect(isRichPreviewEligible({ status: "expired", expires_at: future }, NOW)).toBe(false);
    expect(isRichPreviewEligible({ status: "something_new", expires_at: future }, NOW)).toBe(false);
  });

  it("a sent quote past its expiry is NOT eligible (matches the expired body)", () => {
    expect(isRichPreviewEligible({ status: "sent", expires_at: past }, NOW)).toBe(false);
  });
});
