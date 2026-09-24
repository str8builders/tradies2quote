// ─────────────────────────────────────────────────────────────────────────
// REVIEW GUARD — render-stage provenance + licensing enforcement (pure).
//
// The Review Quote surface must never present a line as an ordinary value
// unless its quantity has valid provenance:
//
//   calculated     — deterministic takeoff (quantity_source "calculator" /
//                    is_calculated_takeoff)
//   supplier       — mirrors a printed supplier quote (quantity_source
//                    "supplier" / source_line_total evidence; send gate
//                    enforces fidelity)
//   user_confirmed — typed or explicitly confirmed by the tradie
//                    (quantity_source "user", confirmed AI, or a manual
//                    line with no machine flags — user input by
//                    construction; labour/other are tradie-specified scope)
//   ai_unconfirmed — AI-estimated, rendered ONLY with the needs-confirm
//                    badge workflow and hard-blocked at send. NOT stripped:
//                    stripping would destroy the confirm workflow.
//   blocked        — explicit zero-quantity recovery state.
//
// STRIP RULES (logged, never silent):
//   1. structurally invalid lines (non-finite / negative quantity or price;
//      a negative price is kept only for a printed supplier credit line)
//   2. machine-origin deck/insulation-family lines on a job with no
//      matching scope license (a leak-through past the generation guards).
//      User-confirmed lines are NEVER stripped (rule 3: user confirmation
//      is valid provenance, whatever the family).
//
// NORMALIZE (not strip): legacy AI-estimated lines that predate provenance
// fields get quantity_source="ai", quantity_confirmed=false so they flow
// into the existing badge + confirm + send-gate workflow.
//
// Pure + unit-tested. Logging is the caller's job (the page logs strips
// via the agent-events logger).
// ─────────────────────────────────────────────────────────────────────────

import {
  licenseScopes,
  materialFamilyForDescription,
  type MaterialFamily,
} from "@/lib/takeoff/license";
import { routeScope } from "@/lib/takeoff/scope-router";
import type { QuoteData, QuoteLineItem } from "./quote-types";

export type LineProvenance =
  | "calculated"
  | "supplier"
  | "user_confirmed"
  | "ai_unconfirmed"
  | "blocked";

export function classifyLineProvenance(
  it: QuoteLineItem,
): LineProvenance | "invalid" {
  const qty = Number(it.quantity);
  const price = Number(it.unit_price);
  // A negative price is only valid as a discount / credit the supplier quote
  // itself printed (a negative printed line total mirrored 1:1).
  const supplierCredit =
    it.source_line_total != null && Number(it.source_line_total) < 0;
  if (
    !Number.isFinite(qty) ||
    !Number.isFinite(price) ||
    qty < 0 ||
    (price < 0 && !supplierCredit)
  ) {
    return "invalid";
  }
  if (it.takeoff_status === "blocked") return "blocked";
  if (it.quantity_source === "calculator" || it.is_calculated_takeoff) {
    return "calculated";
  }
  if (it.quantity_source === "supplier" || it.source_line_total != null) {
    return "supplier";
  }
  if (it.quantity_source === "user") return "user_confirmed";
  if (it.quantity_source === "ai") {
    return it.quantity_confirmed === true ? "user_confirmed" : "ai_unconfirmed";
  }
  // No quantity_source — legacy or manual lines.
  if (it.is_ai_estimated === true) return "ai_unconfirmed"; // legacy AI line
  // Manual/labour/other: the tradie typed it — user input by construction.
  return "user_confirmed";
}

/** Provenances a machine produced (strippable when unlicensed). */
const MACHINE: ReadonlySet<LineProvenance> = new Set([
  "calculated",
  "ai_unconfirmed",
]);

/**
 * Exact tool-output licences for the two material families protected by the
 * leak guard. A generic `t2qcal_` field or a similar-looking description is
 * not evidence: only outputs shipped and audited by T2QCAL are accepted.
 */
export function t2qcalLicensedFamily(
  item: Pick<QuoteLineItem, "t2qcal_source_key">,
): "deck" | "insulation" | null {
  switch (item.t2qcal_source_key) {
    case "deck-boards.lineal-order": return "deck";
    case "insulation-batts.packs-order": return "insulation";
    default: return null;
  }
}

export interface StrippedLine {
  description: string;
  reason: "invalid_values" | "unlicensed_deck" | "unlicensed_insulation";
}

export interface ReviewGuardResult {
  data: QuoteData;
  stripped: StrippedLine[];
  /** Count of legacy AI lines normalized into the confirm workflow. */
  normalized: number;
}

/**
 * Licensed material families for this quote, derived deterministically
 * from the SAME evidence generation used: the original description
 * (voice transcript / scan text — pass `voice_transcript ?? job_summary`).
 */
export function licensedFamiliesForDescription(
  description: string | null | undefined,
): Set<MaterialFamily> {
  const text = description ?? "";
  const route = routeScope(text);
  const scanDeck = /\btype=deck\b/i.test(text);
  const { licenses } = licenseScopes(text, route, {
    scanType: scanDeck ? "deck" : null,
  });
  const families = new Set<MaterialFamily>();
  for (const l of licenses) {
    if (l.scope === "deck") families.add("deck");
    if (l.scope === "insulation") families.add("insulation");
    if (l.scope === "framing") families.add("framing");
    if (l.scope === "lining") families.add("lining");
  }
  return families;
}

/**
 * The evidence licences are judged on: the caller's description (raw voice
 * transcript / scan text, else the job summary) PLUS the cleaned transcript
 * generation actually quoted from (`quote_data.transcript.cleaned`).
 * Generation runs the deterministic voice cleanup before licensing scopes
 * ("pink bats" → "Pink Batts"), so the review + send guards must see the
 * same words or they would strip/block lines generation legitimately made.
 */
export function licensingEvidence(
  data: Pick<QuoteData, "job_summary" | "transcript"> | null | undefined,
  description: string | null | undefined,
): string {
  const base = description ?? data?.job_summary ?? "";
  const transcript = data?.transcript as { cleaned?: unknown } | null | undefined;
  const cleaned =
    transcript && typeof transcript === "object" && typeof transcript.cleaned === "string"
      ? transcript.cleaned
      : "";
  return cleaned && cleaned !== base ? `${base}\n${cleaned}` : base;
}

/**
 * Guard a quote for the review surface. Returns the sanitized data plus
 * what was stripped/normalized so the caller can log and surface it.
 * Never mutates the input.
 */
export function guardQuoteForReview(
  data: QuoteData,
  opts: { description?: string | null } = {},
): ReviewGuardResult {
  const items: QuoteLineItem[] = Array.isArray(data.line_items)
    ? data.line_items
    : [];
  const licensed = licensedFamiliesForDescription(
    licensingEvidence(data, opts.description),
  );
  const kept: QuoteLineItem[] = [];
  const stripped: StrippedLine[] = [];
  let normalized = 0;

  for (const raw of items) {
    const provenance = classifyLineProvenance(raw);
    if (provenance === "invalid") {
      stripped.push({
        description: raw.description ?? "(no description)",
        reason: "invalid_values",
      });
      continue;
    }
    // Unlicensed machine-origin deck/insulation lines are leak-throughs.
    // (Only the two impossibility-rule families; user-confirmed lines of
    // any family always stay.)
    if (MACHINE.has(provenance) && raw.type === "material") {
      const family = materialFamilyForDescription(raw.description ?? "");
      const toolFamily = t2qcalLicensedFamily(raw);
      if (family === "deck" && !licensed.has("deck") && toolFamily !== "deck") {
        stripped.push({ description: raw.description, reason: "unlicensed_deck" });
        continue;
      }
      if (family === "insulation" && !licensed.has("insulation")
          && toolFamily !== "insulation") {
        stripped.push({
          description: raw.description,
          reason: "unlicensed_insulation",
        });
        continue;
      }
    }
    // Normalize legacy AI lines into the explicit confirm workflow so they
    // can never render as ordinary confirmed values.
    if (
      provenance === "ai_unconfirmed" &&
      raw.quantity_source === undefined &&
      raw.is_ai_estimated === true
    ) {
      normalized += 1;
      kept.push({ ...raw, quantity_source: "ai", quantity_confirmed: false });
      continue;
    }
    kept.push(raw);
  }

  if (stripped.length === 0 && normalized === 0) {
    return { data, stripped, normalized };
  }
  return { data: { ...data, line_items: kept }, stripped, normalized };
}
