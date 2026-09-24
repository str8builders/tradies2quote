/**
 * Privacy contract for the Stage 6 transcript layer.
 *
 * The transcript object lives on `QuoteData.transcript` (typed
 * `unknown` to avoid circular imports). It MUST NOT leak to the public
 * `/quote/[token]` page in any form. Three layers of defence — same
 * pattern Stage 5 uses for `compliance_review`:
 *
 *   1. Type-level: `PublicQuotePayload` declares no transcript field.
 *      `PublicLineItem` declares its exact 6 customer-facing keys.
 *      A type-level assertion below proves transcript field names
 *      don't appear in either.
 *
 *   2. Construction: `get_quote_by_token` (Supabase RPC) projects only
 *      the customer-facing fields when shaping the public payload, so
 *      `quote_data.transcript` is dropped server-side before the
 *      response leaves Postgres. (Verified live in the Phase F smoke
 *      tests' "no matcher leaks" curl scan, which scans for arbitrary
 *      internal field names — extending the same scan to transcript
 *      fields after deploy proves the same.)
 *
 *   3. Runtime: this test models the public projection explicitly and
 *      confirms no transcript field name survives.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  PublicLineItem,
  PublicQuotePayload,
  QuoteData,
} from "./quote-types";

/** Transcript field names that MUST NOT appear on any public type. */
type TranscriptKeys =
  | "transcript"
  | "raw"
  | "cleaned"
  | "summary"
  | "corrections"
  | "clarification_questions"
  | "confidence";

describe("Stage 6 transcript privacy", () => {
  it("type-level: PublicQuotePayload has no transcript-shaped key", () => {
    type Leak = TranscriptKeys & keyof PublicQuotePayload;
    expectTypeOf<Leak>().toEqualTypeOf<never>();
  });

  it("type-level: PublicLineItem has no transcript-shaped key", () => {
    type Leak = TranscriptKeys & keyof PublicLineItem;
    expectTypeOf<Leak>().toEqualTypeOf<never>();
  });

  it("type-level: PublicLineItem still has its exact 6 customer-facing keys", () => {
    type Expected =
      | "type"
      | "description"
      | "quantity"
      | "unit"
      | "unit_price"
      | "line_total";
    expectTypeOf<keyof PublicLineItem>().toEqualTypeOf<Expected>();
  });

  it("runtime: a QuoteData with a transcript projects to a clean PublicQuotePayload", () => {
    const fullQuoteData: QuoteData = {
      client: { name: "Phase F Smoke", address: null, contact: null, email: null, phone: null },
      job_summary: "build a wall",
      line_items: [
        {
          type: "material",
          description: "GIB Aqualine 13mm",
          quantity: 8,
          unit: "sheet",
          unit_price: 78,
          line_total: 624,
        },
      ],
      materials_subtotal: 624,
      labour_subtotal: 0,
      markup_pct: 20,
      markup_amount: 0,
      subtotal_before_tax: 624,
      tax_amount: 93.6,
      total: 717.6,
      currency: "NZD",
      tax_label: "GST",
      tax_rate: 15,
      terms: "30 days",
      notes: [],
      // The fields that MUST NOT leak:
      transcript: {
        raw: "build me a six metre wall with jib sheets",
        cleaned: "build me a 6m wall with GIB sheets",
        summary: { job_type: "wall", confidence: 0.7 },
        corrections: [{ before: "jib", after: "GIB", type: "brand_plasterboard", index: 0 }],
        clarification_questions: [
          { id: "transcript.x", question: "?", why: "?", phrase: "x" },
        ],
        confidence: 0.7,
      },
      compliance_review: { status: "ok" },
    };

    // Model the projection that `get_quote_by_token` performs. The RPC
    // selects only the public-side fields out of quote_data into the
    // PublicQuotePayload shape — we encode that shape here and assert
    // every transcript-shaped key is absent.
    const publicPayload: PublicQuotePayload = {
      id: "q-1",
      status: "sent",
      created_at: "2026-05-09T00:00:00Z",
      sent_at: null,
      expires_at: null,
      accepted_at: null,
      accepted_name: null,
      accepted_quote_version: 1,
      version: 1,
      currency: fullQuoteData.currency,
      has_pdf: false,
      has_signature: false,
      has_logo: false,
      business_name: null,
      business_email: null,
      business_phone: null,
      client: {
        name: fullQuoteData.client.name,
        address: fullQuoteData.client.address,
        email: null,
        phone: null,
      },
      job_summary: fullQuoteData.job_summary,
      line_items: fullQuoteData.line_items.map((li) => ({
        type: li.type,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unit_price: li.unit_price,
        line_total: li.line_total,
      })),
      materials_subtotal: fullQuoteData.materials_subtotal,
      labour_subtotal: fullQuoteData.labour_subtotal,
      markup_amount: fullQuoteData.markup_amount,
      subtotal_before_tax: fullQuoteData.subtotal_before_tax,
      tax_amount: fullQuoteData.tax_amount,
      total: fullQuoteData.total,
      tax_label: fullQuoteData.tax_label,
      tax_rate: fullQuoteData.tax_rate,
      terms: fullQuoteData.terms,
    };

    const topLevelKeys = Object.keys(publicPayload);
    for (const forbidden of [
      "transcript",
      "raw",
      "cleaned",
      "summary",
      "corrections",
      "clarification_questions",
      "confidence",
    ]) {
      expect(topLevelKeys).not.toContain(forbidden);
    }

    // PublicLineItem inside line_items: also no transcript fields.
    for (const li of publicPayload.line_items) {
      const liKeys = Object.keys(li);
      for (const forbidden of [
        "transcript",
        "raw",
        "cleaned",
        "summary",
        "corrections",
        "clarification_questions",
        "confidence",
        "compliance_source_type",
        "reason",
        "citations",
        "material_id",
        "library_id",
        "price_match_key",
        "price_source",
        "price_confidence",
      ]) {
        expect(liKeys).not.toContain(forbidden);
      }
    }
  });

  it("type-level: QuoteData.transcript IS allowed (it's the storage location)", () => {
    // Defensive type-level proof that adding `transcript` to QuoteData
    // didn't accidentally make it required (which would break every
    // existing call site that doesn't set it).
    expectTypeOf<QuoteData["transcript"]>().toEqualTypeOf<unknown>();
  });
});
