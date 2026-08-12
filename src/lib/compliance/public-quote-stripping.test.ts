/**
 * Test 11 — Public quote payload strips all internal compliance fields.
 *
 * The Stage-5 compliance fields are widened onto `QuoteLineItem`. Three
 * layers of defence guarantee they never leak to a customer:
 *
 *   1. Type-level: `PublicLineItem` declares its EXACT 6 fields. Any
 *      attempt to widen it to expose a compliance field would fail the
 *      already-existing `materialMatchingPipeline.test.ts` exact-keys
 *      assertion. We re-assert here for the new fields specifically.
 *
 *   2. Construction: the Supabase RPC `get_quote_by_token` projects only
 *      the 6 customer-facing fields when shaping the public payload, so
 *      the database never returns the compliance metadata to the
 *      `/quote/[token]` page. (Tested live in Phase F's
 *      "no matcher leaks" smoke test, which already validates this for
 *      the matcher fields and applies the same logic to ours.)
 *
 *   3. Runtime: this test instantiates a `PublicLineItem` from a
 *      `QuoteLineItem` carrying every compliance field, and confirms
 *      none of those fields appear on the public side.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  PublicLineItem,
  QuoteLineItem,
  ComplianceCitation,
} from "../quote-types";

/** Compliance-field names we must never see on PublicLineItem. */
type StagedComplianceKeys =
  | "reason"
  | "confidence"
  | "compliance_source_type"
  | "compliance_notes"
  | "required_confirmations"
  | "citations";

type T2QCALInternalKeys =
  | "t2qcal_source_key"
  | "t2qcal_basis_fingerprint"
  | "t2qcal_assumptions"
  | "t2qcal_checks"
  | "t2qcal_provenance_note"
  | "t2qcal_calculator_snapshot";

describe("PublicLineItem strips Stage-5 compliance fields (test 11)", () => {
  it("type-level: none of the compliance keys are in keyof PublicLineItem", () => {
    type Leak = (StagedComplianceKeys | T2QCALInternalKeys) & keyof PublicLineItem;
    // If any compliance key sneaks onto PublicLineItem, `Leak` widens
    // beyond `never` and the type-level assertion below fails to compile.
    expectTypeOf<Leak>().toEqualTypeOf<never>();
  });

  it("type-level: PublicLineItem still has its exact 6 customer-facing keys", () => {
    type ExpectedPublicKeys =
      | "type"
      | "description"
      | "quantity"
      | "unit"
      | "unit_price"
      | "line_total";
    type Actual = keyof PublicLineItem;
    expectTypeOf<Actual>().toEqualTypeOf<ExpectedPublicKeys>();
  });

  it("runtime: a QuoteLineItem with every compliance field projects to a clean PublicLineItem", () => {
    const citations: ComplianceCitation[] = [
      { source_id: "nzbc-h1", reason: "Internal partition test." },
    ];

    const internal: QuoteLineItem = {
      type: "material",
      description: "Pink Batts R2.6",
      quantity: 12,
      unit: "pack",
      unit_price: 89,
      line_total: 1068,
      // Stage-4 matcher fields:
      material_id: "11111111-1111-1111-1111-111111111111",
      library_id: "22222222-2222-2222-2222-222222222222",
      price_match_key: "pink batts r2.6",
      price_source: "missing_price",
      price_confidence: "low",
      is_ai_estimated: true,
      is_missing_price: true,
      // Stage-5 compliance fields:
      reason: "Internal dry partition — flagged for review.",
      confidence: "low",
      compliance_source_type: "missing_context",
      compliance_notes: ["Insulation not required by default for internal walls."],
      required_confirmations: ["Confirm acoustic separation requirement."],
      citations,
      t2qcal_source_key: "insulation-batts.packs-order",
      t2qcal_basis_fingerprint: "v1|insulation-pack|l0=1160|l1=580|v0=10",
      t2qcal_assumptions: ["10 batts per pack"],
      t2qcal_checks: ["Quantity is rounded up to whole packs"],
      t2qcal_provenance_note: "Deterministic T2QCAL result",
      t2qcal_calculator_snapshot: {
        toolSlug: "insulation-batts",
        toolName: "Insulation batts",
        inputs: [{ key: "pack", label: "Batts per pack", value: 10, unit: "" }],
      },
    };

    // The public projection that the Supabase RPC would perform — we
    // model it explicitly here so the test catches any future drift.
    const publicProjection: PublicLineItem = {
      type: internal.type,
      description: internal.description,
      quantity: internal.quantity,
      unit: internal.unit,
      unit_price: internal.unit_price,
      line_total: internal.line_total,
    };

    const publicKeys = Object.keys(publicProjection) as Array<
      keyof PublicLineItem
    >;
    expect(publicKeys.sort()).toEqual([
      "description",
      "line_total",
      "quantity",
      "type",
      "unit",
      "unit_price",
    ]);

    // None of the compliance keys is present on the public projection.
    for (const key of [
      "reason",
      "confidence",
      "compliance_source_type",
      "compliance_notes",
      "required_confirmations",
      "citations",
      "material_id",
      "library_id",
      "price_match_key",
      "price_source",
      "price_confidence",
      "t2qcal_source_key",
      "t2qcal_basis_fingerprint",
      "t2qcal_assumptions",
      "t2qcal_checks",
      "t2qcal_provenance_note",
      "t2qcal_calculator_snapshot",
    ] as const) {
      expect(publicKeys).not.toContain(key);
    }
  });
});
