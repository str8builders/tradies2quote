import { describe, expect, it } from "vitest";
import { QUOTE_VALIDITY_DAYS, documentValidUntil, expiryForSend, freshExpiry, quoteValidUntil } from "./quote-expiry";

const now = new Date("2026-09-28T10:00:00.000Z");
const in30 = "2026-10-28T10:00:00.000Z";

describe("expiryForSend", () => {
  it("gives a first send 30 days", () => {
    expect(QUOTE_VALIDITY_DAYS).toBe(30);
    expect(freshExpiry(now)).toBe(in30);
    expect(expiryForSend(null, now)).toBe(in30);
    expect(expiryForSend(undefined, now)).toBe(in30);
    expect(expiryForSend("", now)).toBe(in30);
    expect(expiryForSend("not a date", now)).toBe(in30);
  });

  it("keeps a live expiry on a re-send (a reminder never moves the offer date)", () => {
    expect(expiryForSend("2026-10-05T00:00:00.000Z", now)).toBe("2026-10-05T00:00:00.000Z");
    expect(expiryForSend("2026-10-05T00:00:00+00:00", now)).toBe("2026-10-05T00:00:00.000Z");
  });

  it("replaces an expiry that has passed, so the link is not dead on arrival", () => {
    expect(expiryForSend("2026-09-01T00:00:00.000Z", now)).toBe(in30);
    expect(expiryForSend(now.toISOString(), now)).toBe(in30);
  });
});

describe("quoteValidUntil — the one date the link, the job page and the PDF show", () => {
  it("a sent quote shows its stored expiry, even when it has passed", () => {
    for (const status of ["sent", "viewed", "declined", "expired", "accepted", "completed"]) {
      expect(quoteValidUntil({ status, expires_at: "2026-09-01T00:00:00.000Z" }, now)).toBe("2026-09-01T00:00:00.000Z");
    }
    expect(quoteValidUntil({ status: "sent", expires_at: null }, now)).toBe(in30);
  });

  it("a draft shows what sending it now would set", () => {
    expect(quoteValidUntil({ status: "draft", expires_at: null }, now)).toBe(in30);
    expect(quoteValidUntil({ expires_at: null }, now)).toBe(in30);
    expect(quoteValidUntil({ status: "draft", expires_at: "2026-10-05T00:00:00.000Z" }, now)).toBe("2026-10-05T00:00:00.000Z");
    expect(quoteValidUntil({ status: "draft", expires_at: "2026-09-01T00:00:00.000Z" }, now)).toBe(in30);
  });
});

describe("documentValidUntil", () => {
  it("prints the caller's date, or a fresh 30 days when missing or unreadable", () => {
    expect(documentValidUntil("2026-10-29T00:00:00Z", now).toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(documentValidUntil(new Date("2026-10-29T00:00:00Z"), now).toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(documentValidUntil(null, now).toISOString()).toBe(in30);
    expect(documentValidUntil("garbage", now).toISOString()).toBe(in30);
  });
});
