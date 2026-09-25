import { describe, expect, it } from "vitest";
import {
  assessQuoteTakeoffSafety,
  validateQuoteForSending,
} from "./quote-validation";
import { computeQuoteTotals, round2 } from "./quote-defaults";
import type { QuoteData, QuoteLineItem } from "./quote-types";

// Audit item 3 — a labour quantity had no sanity check at all: the model's
// number was only clamped at 0, and the send gate's quantity confirmation
// covers materials only. A labour line that can't be right (40 hours on a
// "2 day job", 5,000 hours on anything) now raises a "check this" warning
// that must be acknowledged before sending — same as a $0 line. Nothing is
// changed behind the tradie's back.

const labour = (description: string, quantity: number, unit = "hour", unit_price = 75): QuoteLineItem => ({
  type: "labour",
  description,
  quantity,
  unit,
  unit_price,
  line_total: round2(quantity * unit_price),
});

function quote(items: QuoteLineItem[]): QuoteData {
  const totals = computeQuoteTotals(items, 0, 15);
  return {
    client: { name: "Kim", address: null, email: "kim@example.com", phone: null },
    job_summary: "Job",
    line_items: items,
    markup_pct: 0,
    ...totals,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
    terms: "",
    notes: [],
  };
}

const warnings = (items: QuoteLineItem[], description?: string) =>
  assessQuoteTakeoffSafety(quote(items), { description }).warning_reasons;

describe("labour plausibility — must be acknowledged before sending", () => {
  it("40 hours on a '2 day job' is flagged: more than 12 hours a day (was sent with no flag)", () => {
    const qd = quote([labour("Build deck", 40)]);
    const description = "Build a deck for Dave, it's a 2 day job.";
    const safety = assessQuoteTakeoffSafety(qd, { description });
    expect(safety.warning_reasons).toEqual([
      "Labour adds up to 40 hours, but the job was described as 2 days — that's more than 12 hours a day. Check the labour hours.",
    ]);
    expect(safety.requires_acknowledgement).toBe(true);
    const send = validateQuoteForSending({ status: "draft", total_amount: qd.total, quote_data: qd, description });
    expect(send).toMatchObject({ ok: false, error: "takeoff_unconfirmed" });
    expect(
      validateQuoteForSending({ status: "draft", total_amount: qd.total, quote_data: qd, description, acknowledged: true }).ok,
    ).toBe(true);
  });

  it("5 days of labour on a '2 day job' is flagged (was not)", () => {
    expect(warnings([labour("Labour", 5, "day", 600)], "Two day job to reline the bathroom.")).toEqual([
      "Labour adds up to 5 days, but the job was described as 2 days. Check the labour days.",
    ]);
  });

  it("30 hours when the tradie said 'about 6 hours' is flagged (was not)", () => {
    expect(warnings([labour("Fit doors", 30)], "Hang three doors, about 6 hours.")).toEqual([
      "Labour adds up to 30 hours, but the job was described as 6 hours. Check the labour hours.",
    ]);
  });

  it("an absurd labour line is flagged even with no duration stated (5000 hours was not)", () => {
    expect(warnings([labour("Paint house", 5000)])).toEqual([
      '"Paint house" has 5000 hours of labour — that can\'t be right for one line. Check the quantity.',
    ]);
    expect(warnings([labour("Paint house", 400, "day", 600)])).toEqual([
      '"Paint house" has 400 days of labour — that can\'t be right for one line. Check the quantity.',
    ]);
  });
});

describe("labour plausibility — no false alarms", () => {
  it("16 hours on a 2 day job is fine", () => {
    expect(warnings([labour("Build deck", 16)], "It's a 2 day job.")).toEqual([]);
  });

  it("a stated crew raises the cap: 40 hours for '2 guys for 2 days' is fine", () => {
    expect(warnings([labour("Build deck", 40)], "Me and 2 guys... actually 2 guys for 2 days.")).toEqual([]);
    expect(warnings([labour("Build deck", 40)], "Me and my apprentice, 2 days.")).toEqual([]);
  });

  it("a rate is not a duration: '$600 a day' with 2 days of labour is fine", () => {
    expect(warnings([labour("Labour", 2, "day", 600)], "Charge $600 a day for labour.")).toEqual([]);
    expect(warnings([labour("Labour", 10)], "My rate is $85 per hour, it'll take a day.")).toEqual([]);
  });

  it("weeks count as 5 working days: 60 hours for 'about a week' is fine, 70 is not", () => {
    expect(warnings([labour("Reclad", 60)], "About a week's work.")).toEqual([]);
    expect(warnings([labour("Reclad", 70)], "About a week's work.")).toEqual([
      "Labour adds up to 70 hours, but the job was described as 5 days — that's more than 12 hours a day. Check the labour hours.",
    ]);
  });

  it("lump-sum labour (a 'lot') and material lines are not checked", () => {
    expect(warnings([labour("Build retaining wall", 1, "lot", 2500)], "Half a day job.")).toEqual([]);
  });
});
