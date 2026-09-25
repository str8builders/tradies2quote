import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUOTE_PROMPT_STABLE,
  buildQuotePrompt,
  buildQuotePromptParts,
  renderQuotePrompt,
} from "@/lib/quote-prompt";
import type { LibraryMaterial, QuoteProfile } from "@/lib/quote-types";

/**
 * The quote system prompt is split into a stable block (rules, output
 * contract, worked example, final check — the same bytes for every tradie,
 * sent with cache_control) followed by the per-tradie block. The fixture was
 * rendered by the builder BEFORE the split: the text must be the same lines,
 * only reordered, apart from one deliberate pointer fix ("from the top of
 * this prompt" no longer holds once the settings follow the cached block).
 */

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, "fixtures/quote-prompt-before-cache-split.json"),
    "utf8",
  ),
) as Record<"nz_full" | "nz_plain" | "us_empty", string>;

const NZ: QuoteProfile = { business_name: "Test Builders", country: "NZ", default_labour_rate: 75, default_markup_pct: 20, tax_label: "GST", tax_rate: 15, currency: "NZD" };
const US: QuoteProfile = { business_name: "Yard Co", country: "US", default_labour_rate: 60, default_markup_pct: 15, tax_label: "Tax", tax_rate: 8, currency: "USD" };
const LIB: LibraryMaterial[] = [
  { id: "m1", name: "H3.2 90x45 framing pine", unit: "m", default_unit_price: 6.5, supplier: "ITM", supplier_url: null, notes: null, usage_count: 4, is_ai_estimated: false, last_used_at: null },
  { id: "m2", name: "Decking screws 10g", unit: "box", default_unit_price: null, supplier: null, supplier_url: null, notes: null, usage_count: 1, is_ai_estimated: false, last_used_at: null },
];
const PAST = [{ jobSummary: "Replace 6 rotten deck boards", lineItems: [{ type: "material", description: "Decking 90x19", quantity: 6, unit: "each", unit_price: 18.5 }] }];

const CASES = {
  nz_full: () => buildQuotePrompt(NZ, LIB, { skipTakeoffMaterials: true, pastQuotes: PAST }),
  nz_plain: () => buildQuotePrompt(NZ, LIB, {}),
  us_empty: () => buildQuotePrompt(US, [], {}),
};

const POINTER_BEFORE = "ALWAYS use the tradie's actual settings from the top of this prompt.";
const POINTER_AFTER = `ALWAYS use the tradie's actual settings given under "The tradie's settings".`;

/** Non-empty lines as a sorted multiset. */
const lines = (text: string) =>
  text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .sort();

describe("quote prompt cache split", () => {
  it.each(Object.keys(CASES) as Array<keyof typeof CASES>)(
    "%s renders the same lines as before the split",
    (key) => {
      const before = FIXTURE[key].replace(POINTER_BEFORE, POINTER_AFTER);
      expect(lines(CASES[key]())).toEqual(lines(before));
      expect(CASES[key]().length).toBe(before.length);
    },
  );

  it("puts the stable block first and renders stable + tradie", () => {
    const parts = buildQuotePromptParts(NZ, LIB, { pastQuotes: PAST });
    expect(parts.stable).toBe(QUOTE_PROMPT_STABLE);
    expect(renderQuotePrompt(parts)).toBe(`${parts.stable}\n\n${parts.tradie}`);
    expect(buildQuotePrompt(NZ, LIB, { pastQuotes: PAST })).toBe(renderQuotePrompt(parts));
    expect(parts.stable.startsWith("Common Whisper transcription mistakes")).toBe(true);
    expect(parts.stable.trimEnd().endsWith('The string "GIB" or "GIB-line" should appear in their place.')).toBe(true);
    expect(parts.tradie.startsWith("You are a senior estimator helping a New Zealand tradie")).toBe(true);
  });

  it("keeps the stable block byte-identical across tradies, countries and jobs", () => {
    const a = buildQuotePromptParts(NZ, LIB, { skipTakeoffMaterials: true, pastQuotes: PAST }).stable;
    const b = buildQuotePromptParts(US, [], {}).stable;
    expect(a).toBe(b);
  });

  it("holds nothing tradie-specific in the stable block", () => {
    const { stable } = buildQuotePromptParts(US, LIB, { skipTakeoffMaterials: true, pastQuotes: PAST });
    for (const tradieValue of ["United States", "USD", "Tax at 8%", "THE TRADIE'S MATERIALS LIBRARY", "@ USD 6.50 (ITM)", "Replace 6 rotten deck boards", "TAKEOFF MATERIALS ARE BEING CALCULATED", "Default labour rate"]) {
      expect(stable).not.toContain(tradieValue);
    }
    expect(stable).not.toContain("${");
  });

  it("is comfortably above the model's cache minimum (Sonnet 5: 1,024 tokens)", () => {
    // ~4 characters per token is a conservative floor for English prose.
    expect(QUOTE_PROMPT_STABLE.length / 4).toBeGreaterThan(1_500);
  });
});
