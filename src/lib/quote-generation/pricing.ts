import { verifiedLibraryUnitPrice } from "@/lib/materials";
import { moneyEquals, round2 } from "@/lib/quote-defaults";
import type { LibraryMaterial, QuoteLineItem } from "@/lib/quote-types";
import { normaliseUnit } from "@/lib/units";

/**
 * AI PRICES OFF — the pricing policy every generated quote goes through.
 *
 * AI-guessed numbers never reach a customer. The only prices that survive
 * are the tradie's OWN numbers:
 *   1. LABOUR — a rate stated in the tradie's own transcript ("2 days @
 *      $600", "$2,500 fixed"), else the profile hourly rate on HOUR lines
 *      only. A day/lot/each labour line is never repriced with the hourly
 *      rate ("2 days @ $600" used to become 2 × $75 = $150).
 *   2. MATERIALS strongly matched to the tradie's library, re-verified
 *      against the library row itself (a stored "user_library" tag is never
 *      trusted on its own — the model could have written it).
 * Everything else is left price-pending ($0, is_missing_price) and the send
 * gate makes the tradie price it or acknowledge it.
 */

// "$600", "£1,250.50", "$2.5k"
const CURRENCY_PREFIXED = /[$£€]\s?(\d[\d,]*(?:\.\d+)?)(\s?k\b)?/gi;
// "600 dollars", "2,500 bucks", "75 NZD"
const CURRENCY_SUFFIXED =
  /\b(\d[\d,]*(?:\.\d+)?)(\s?k)?\s*(?:dollars?|bucks|nzd|aud|usd|cad|gbp|quid|pounds?)\b/gi;
// "75 an hour", "600 a day", "85/hr", "90 per hour", "75ph"
const RATE_SUFFIXED =
  /\b(\d[\d,]*(?:\.\d+)?)\s*(?:\/\s*|per\s+|an?\s+|p\/?)(?:hour|hr|h|day)\b/gi;

function amountOf(digits: string, k: string | undefined): number | null {
  const n = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return k ? n * 1000 : n;
}

/**
 * Money amounts the transcript itself states. Digits only — a spoken
 * "six hundred" is not treated as a stated price.
 */
export function extractStatedAmounts(text: string): number[] {
  const out = new Set<number>();
  for (const re of [CURRENCY_PREFIXED, CURRENCY_SUFFIXED]) {
    for (const m of text.matchAll(re)) {
      const a = amountOf(m[1], m[2]);
      if (a !== null) out.add(a);
    }
  }
  for (const m of text.matchAll(RATE_SUFFIXED)) {
    const a = amountOf(m[1], undefined);
    if (a !== null) out.add(a);
  }
  return [...out];
}

export type LabourPricingContext = {
  /** profiles.default_labour_rate (per hour). */
  hourlyRate: number;
  /** extractStatedAmounts(transcript) — empty when the transcript isn't the tradie's own words. */
  statedAmounts: number[];
};

export type LabourPriceDecision = {
  unit_price: number;
  is_missing_price: boolean;
  basis: "stated" | "hourly_rate" | "day_rate_from_hourly" | "pending";
};

/** A plausible working day, in hours, for a day rate built from an hourly rate. */
const MIN_DAY_HOURS = 4;
const MAX_DAY_HOURS = 12;

export function priceLabourLine(
  line: Pick<QuoteLineItem, "quantity" | "unit" | "unit_price">,
  ctx: LabourPricingContext,
): LabourPriceDecision {
  const qty = Number(line.quantity) || 0;
  const modelPrice = Number(line.unit_price) || 0;
  const pending: LabourPriceDecision = {
    unit_price: 0,
    is_missing_price: true,
    basis: "pending",
  };

  // 1. The transcript states this rate (or this line's total) — the
  //    tradie's own number, whatever the unit.
  if (
    modelPrice > 0 &&
    ctx.statedAmounts.some(
      (a) =>
        moneyEquals(a, modelPrice) ||
        (qty > 0 && moneyEquals(a, round2(qty * modelPrice))),
    )
  ) {
    return { unit_price: modelPrice, is_missing_price: false, basis: "stated" };
  }

  const unit = normaliseUnit(line.unit);
  // A blank unit is the prompt's default labour unit (hours).
  const hourly = unit ? unit.dimension === "hour" : !(line.unit ?? "").trim();
  const rate = Number(ctx.hourlyRate) || 0;

  // 2. Hour lines with no stated rate → the profile hourly rate.
  if (hourly) {
    return rate > 0
      ? { unit_price: rate, is_missing_price: false, basis: "hourly_rate" }
      : pending;
  }

  // 3. A day rate that is a whole working day at the tradie's own hourly
  //    rate (profile or stated) is theirs too; any other day rate is a guess.
  if (unit?.dimension === "day" && modelPrice > 0) {
    const hourlyRates = [rate, ...ctx.statedAmounts].filter((r) => r > 0);
    const derived = hourlyRates.some((r) => {
      const hours = modelPrice / r;
      const whole = Math.round(hours);
      return (
        Math.abs(hours - whole) < 1e-9 &&
        whole >= MIN_DAY_HOURS &&
        whole <= MAX_DAY_HOURS
      );
    });
    if (derived) {
      return {
        unit_price: modelPrice,
        is_missing_price: false,
        basis: "day_rate_from_hourly",
      };
    }
  }

  // 4. Day / lot / each / visit labour with no stated price: pending.
  return pending;
}

export type PricingContext = LabourPricingContext & {
  library: LibraryMaterial[];
};

/** Apply the AI-prices-off policy in place; returns the same array. */
export function applyPricingPolicy(
  items: QuoteLineItem[],
  ctx: PricingContext,
): QuoteLineItem[] {
  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    it.is_ai_estimated = false;

    if (it.type === "labour") {
      const d = priceLabourLine(it, ctx);
      it.unit_price = d.unit_price;
      it.line_total = round2(qty * d.unit_price);
      it.is_missing_price = d.is_missing_price;
      if (d.is_missing_price) {
        it.price_source = "missing_price";
        it.price_confidence = undefined;
      }
      continue;
    }

    if (
      it.type === "material" &&
      it.price_source === "user_library" &&
      it.price_confidence === "high"
    ) {
      const verified = verifiedLibraryUnitPrice(it, ctx.library);
      if (
        verified !== null &&
        verified > 0 &&
        Math.abs(verified - (Number(it.unit_price) || 0)) < 1e-9
      ) {
        it.unit_price = verified;
        it.line_total = round2(qty * verified);
        it.is_missing_price = false;
        continue;
      }
    }

    it.unit_price = 0;
    it.line_total = 0;
    it.is_missing_price = true;
    it.price_source = "missing_price";
    it.price_confidence = undefined;
  }
  return items;
}
