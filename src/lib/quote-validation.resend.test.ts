import { describe, expect, it } from "vitest";
import { validateQuoteForSending, validateQuoteForSmsSending } from "./quote-validation";

/** Audit 2026-09-15: a job that is underway or finished must never be resent (it would regress to "sent"). */
describe("resend guard", () => {
  for (const status of ["scheduled", "in_progress", "completed"] as const) {
    it(`blocks email and SMS resend at ${status}`, () => {
      expect(validateQuoteForSending({ status, quote_data: null, total_amount: null })).toEqual({ ok: false, error: "job_underway" });
      expect(validateQuoteForSmsSending({ status, quote_data: null, total_amount: null })).toEqual({ ok: false, error: "job_underway" });
    });
  }
  it("still reports accepted first and lets a draft through to the content checks", () => {
    expect(validateQuoteForSending({ status: "accepted", quote_data: null, total_amount: null })).toEqual({ ok: false, error: "already_accepted" });
    expect(validateQuoteForSending({ status: "draft", quote_data: null, total_amount: null })).toEqual({ ok: false, error: "no_line_items" });
  });
});
