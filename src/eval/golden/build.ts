// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — builder for takeoff jobs (quantities → priced quote).
//
// A takeoff job runs through production code in one of two ways:
//   pipeline   — the spoken/typed/scanned transcript goes through the same
//                deterministic chain run.ts uses (see pipeline.ts);
//   structured — a structured input goes straight into the production
//                calculator (the Takeoff assumptions panel, a scan/LLM
//                extraction), for jobs whose words can't reach a calculator.
//
// It is then priced the way a real quote is:
//   - calculator lines arrive unpriced (run.ts never auto-prices a takeoff
//     line); the tradie types their own library price on each, so a line
//     total is round2(code quantity × typed price);
//   - the model's labour lines go through the production AI-prices-off
//     policy (applyPricingPolicy) with the transcript's stated amounts and
//     the profile hourly rate — the expected price is what that policy's
//     documented rules give;
//   - extra lines the tradie adds by hand (skip bin, pump hire) keep the
//     price they typed;
//   - totals come from computeQuoteTotals, the single money source.
// Money uses the CODE's quantities, so a wrong quantity shows up in the
// dollars too (those money keys are listed as the same known bug).
// ─────────────────────────────────────────────────────────────────────────

import { computeQuoteTotals, round2 } from "@/lib/quote-defaults";
import { applyPricingPolicy, extractStatedAmounts } from "@/lib/quote-generation/pricing";
import type { QuoteLineItem, QuoteItemType } from "@/lib/quote-types";
import { runDeterministicPipeline } from "./pipeline";
import type { Actual, Actuals, Expected, GoldenJob, Trade } from "./types";
import { text } from "./types";

export type SimpleLine = { id: string; quantity: number; unit: string };

export type LineSpec = {
  /** Expected quantity — count(...) or decimal(...). */
  qty: Expected;
  /** Expected unit label, when worth pinning. */
  unit?: string;
  /** The tradie's ex-GST library price typed onto this line (dollars). */
  price?: string;
  /** Expected line total — money(...). Required when `price` is set. */
  total?: Expected;
};

export type LabourSpec = {
  description: string;
  quantity: number;
  unit: string;
  /** What the quote model wrote on the line; the pricing policy decides what survives. */
  modelPrice: number;
  /** Expected unit price after applyPricingPolicy. */
  price: Expected;
  /** Expected line total after applyPricingPolicy. */
  total: Expected;
};

export type ExtraSpec = {
  type: QuoteItemType;
  description: string;
  quantity: number;
  unit: string;
  /** Price the tradie typed (dollars). */
  price: string;
  total: Expected;
};

export type Profile = {
  /** profiles.default_labour_rate — $/hour. */
  hourlyRate: number;
  markupPct: number;
  taxRate: number;
};

export type TotalsSpec = {
  materials_subtotal: Expected;
  labour_subtotal: Expected;
  markup_amount: Expected;
  subtotal_before_tax: Expected;
  tax_amount: Expected;
  total: Expected;
};

export type TakeoffSource =
  | { kind: "pipeline" }
  | {
      kind: "structured";
      /** Which production entry point this stands for (documentation). */
      entryPoint: string;
      run: () => { lines: SimpleLine[]; inputs?: Record<string, Actual> };
    };

export type TakeoffJobSpec = {
  id: string;
  trade: Trade;
  title: string;
  said: string;
  structured: string;
  source: TakeoffSource;
  /** Parsed structured inputs to pin (pipeline: `parsed.input.<field>`). */
  inputs?: Record<string, Expected>;
  /** Expected parsed takeoff type (pipeline only). */
  parsedType?: Expected;
  lines: Record<string, LineSpec>;
  /**
   * The job must emit EXACTLY these line ids — no phantom scope lines.
   * Default true.
   */
  exactLines?: boolean;
  profile?: Profile;
  labour?: LabourSpec[];
  extras?: ExtraSpec[];
  totals?: TotalsSpec;
  knownBugs?: Record<string, string>;
};

const TOTAL_KEYS = [
  "materials_subtotal",
  "labour_subtotal",
  "markup_amount",
  "subtotal_before_tax",
  "tax_amount",
  "total",
] as const;

export function takeoffJob(spec: TakeoffJobSpec): GoldenJob {
  const expect: Record<string, Expected> = {};

  if (spec.parsedType) expect["parsed:type"] = spec.parsedType;
  for (const [field, e] of Object.entries(spec.inputs ?? {})) expect[`input:${field}`] = e;

  if (spec.exactLines !== false) {
    const ids = Object.keys(spec.lines).sort();
    expect.lines = text(ids.join(", "), `the job emits exactly: ${ids.join(", ")} — nothing else`);
  }
  for (const [id, l] of Object.entries(spec.lines)) {
    expect[`qty:${id}`] = l.qty;
    if (l.unit !== undefined) expect[`unit:${id}`] = text(l.unit, `unit of ${id}`);
    if (l.price !== undefined) {
      if (!l.total) throw new Error(`${spec.id}: line ${id} has a price but no expected total`);
      expect[`total:${id}`] = l.total;
    }
  }
  (spec.labour ?? []).forEach((l, i) => {
    expect[`labour:${i}:price`] = l.price;
    expect[`labour:${i}:total`] = l.total;
  });
  (spec.extras ?? []).forEach((x, i) => {
    expect[`extra:${i}:total`] = x.total;
  });
  if (spec.totals) {
    if (!spec.profile) throw new Error(`${spec.id}: totals need a profile`);
    for (const k of TOTAL_KEYS) expect[k] = spec.totals[k];
  }

  const compute = (): Actuals => {
    let lines: SimpleLine[];
    let inputs: Record<string, Actual> = {};
    let transcript = spec.said;
    const actual: Actuals = {};

    if (spec.source.kind === "pipeline") {
      const r = runDeterministicPipeline(spec.said);
      transcript = r.transcript;
      lines = r.lines.map((l) => ({ id: l.id, quantity: l.quantity, unit: l.unit }));
      inputs = r.parsed.input as Record<string, Actual>;
      actual["parsed:type"] = r.parsed.type;
    } else {
      const r = spec.source.run();
      lines = r.lines;
      inputs = r.inputs ?? {};
    }

    for (const field of Object.keys(spec.inputs ?? {})) actual[`input:${field}`] = inputs[field];

    const byId = new Map<string, SimpleLine>();
    for (const l of lines) {
      if (byId.has(l.id)) throw new Error(`${spec.id}: duplicate line id ${l.id}`);
      byId.set(l.id, l);
    }
    actual.lines = [...byId.keys()].sort().join(", ");
    for (const id of Object.keys(spec.lines)) {
      const l = byId.get(id);
      actual[`qty:${id}`] = l?.quantity;
      actual[`unit:${id}`] = l?.unit;
    }

    const items: Array<Pick<QuoteLineItem, "type" | "quantity" | "unit_price">> = [];
    for (const [id, l] of Object.entries(spec.lines)) {
      if (l.price === undefined) continue;
      const qty = byId.get(id)?.quantity ?? 0;
      const price = Number(l.price);
      actual[`total:${id}`] = round2(qty * price);
      items.push({ type: "material", quantity: qty, unit_price: price });
    }

    if (spec.labour && spec.labour.length > 0) {
      const labourItems: QuoteLineItem[] = spec.labour.map((l) => ({
        type: "labour",
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.modelPrice,
        line_total: round2(l.quantity * l.modelPrice),
      }));
      applyPricingPolicy(labourItems, {
        hourlyRate: spec.profile?.hourlyRate ?? 0,
        statedAmounts: extractStatedAmounts(transcript),
        library: [],
      });
      labourItems.forEach((it, i) => {
        actual[`labour:${i}:price`] = it.unit_price;
        actual[`labour:${i}:total`] = it.line_total;
        items.push({ type: "labour", quantity: it.quantity, unit_price: it.unit_price });
      });
    }

    (spec.extras ?? []).forEach((x, i) => {
      const price = Number(x.price);
      actual[`extra:${i}:total`] = round2(x.quantity * price);
      items.push({ type: x.type, quantity: x.quantity, unit_price: price });
    });

    if (spec.totals && spec.profile) {
      const t = computeQuoteTotals(items, spec.profile.markupPct, spec.profile.taxRate);
      for (const k of TOTAL_KEYS) actual[k] = t[k];
    }
    return actual;
  };

  return {
    id: spec.id,
    trade: spec.trade,
    title: spec.title,
    said: spec.said,
    structured: spec.structured,
    expect,
    knownBugs: spec.knownBugs,
    compute,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Money-only jobs: a finished quote's lines (the tradie's final quantities
// and prices, as saved from Review Quote) → per-line totals + quote totals.
// ─────────────────────────────────────────────────────────────────────────

export type QuoteLineSpec = {
  type: QuoteItemType;
  description: string;
  quantity: number;
  unit: string;
  /** Unit price as typed (dollars, any precision — "0.125" is allowed). */
  price: string;
  total: Expected;
};

export type QuoteJobSpec = {
  id: string;
  title: string;
  said: string;
  structured: string;
  lines: QuoteLineSpec[];
  markupPct: number;
  taxRate: number;
  totals: TotalsSpec;
  /** Extra figures computed from the same quote (e.g. a send-gate check). */
  extra?: {
    expect: Record<string, Expected>;
    compute: (items: QuoteLineItem[], totals: ReturnType<typeof computeQuoteTotals>) => Actuals;
  };
  knownBugs?: Record<string, string>;
};

export function quoteJob(spec: QuoteJobSpec): GoldenJob {
  const expect: Record<string, Expected> = {};
  spec.lines.forEach((l, i) => {
    expect[`line:${i + 1}`] = l.total;
  });
  for (const k of TOTAL_KEYS) expect[k] = spec.totals[k];
  Object.assign(expect, spec.extra?.expect ?? {});

  const compute = (): Actuals => {
    const actual: Actuals = {};
    const items: QuoteLineItem[] = spec.lines.map((l, i) => {
      const unit_price = Number(l.price);
      const line_total = round2(l.quantity * unit_price);
      actual[`line:${i + 1}`] = line_total;
      return {
        type: l.type,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price,
        line_total,
      };
    });
    const t = computeQuoteTotals(items, spec.markupPct, spec.taxRate);
    for (const k of TOTAL_KEYS) actual[k] = t[k];
    Object.assign(actual, spec.extra?.compute(items, t) ?? {});
    return actual;
  };

  return {
    id: spec.id,
    trade: "money",
    title: spec.title,
    said: spec.said,
    structured: spec.structured,
    expect,
    knownBugs: spec.knownBugs,
    compute,
  };
}

/**
 * The money keys a wrong material quantity flows into. Use when a quantity
 * bug is already recorded, so the dollars carry the same note.
 */
export function moneyCascade(
  lineIds: string[],
  note: string,
  opts: { labourAffected?: boolean } = {},
): Record<string, string> {
  const keys = [
    ...lineIds.map((id) => `total:${id}`),
    "materials_subtotal",
    "markup_amount",
    "subtotal_before_tax",
    "tax_amount",
    "total",
    ...(opts.labourAffected ? ["labour_subtotal"] : []),
  ];
  return Object.fromEntries(keys.map((k) => [k, note]));
}
