/**
 * Quote-generation eval cases.
 *
 * Each case is a realistic job description + the settings/library it
 * should be quoted against + named CHECKS the resulting quote must
 * pass. The runner (quote-eval.test.ts) builds the REAL prompt, calls
 * Claude, parses the quote, and scores it against the universal checks
 * below plus each case's own checks.
 *
 * The cases here are SEEDS — review them and add real ones. The whole
 * point is that "is the quote agent good?" becomes a number you can
 * watch move when you change a prompt, instead of a gut feel.
 *
 * Run with:  npm run eval:quotes   (requires ANTHROPIC_API_KEY)
 */
import type {
  LibraryMaterial,
  QuoteData,
  QuoteProfile,
} from "@/lib/quote-types";

/** A named assertion against a generated quote. */
export type QuoteCheck = {
  label: string;
  pass: (q: QuoteData) => boolean;
  /**
   * Hard-fail the case when this check fails (like the universal checks).
   * Used for numbers the tradie SAID — those must come back exactly.
   */
  hard?: boolean;
};

export type QuoteEvalCase = {
  id: string;
  /** The raw voice/typed job description fed to the quote agent. */
  description: string;
  /** Settings the quote is generated against. Defaults to TEST_PROFILE. */
  profile?: QuoteProfile;
  /** Materials library available to the agent. Defaults to TEST_LIBRARY. */
  library?: LibraryMaterial[];
  /** Checks specific to this job (run on top of the universal ones). */
  checks: QuoteCheck[];
};

function lib(
  id: string,
  name: string,
  unit: string,
  price: number,
  supplier: string,
): LibraryMaterial {
  return {
    id,
    name,
    unit,
    default_unit_price: price,
    supplier,
    supplier_url: null,
    notes: null,
    usage_count: 5,
    is_ai_estimated: false,
    last_used_at: null,
  };
}

/** A plausible NZ sole-trader profile used by every case unless overridden. */
export const TEST_PROFILE: QuoteProfile = {
  business_name: "Test Trade Co",
  country: "NZ",
  default_labour_rate: 75,
  default_markup_pct: 20,
  tax_label: "GST",
  tax_rate: 15,
  currency: "NZD",
};

/** A small, realistic materials library. */
export const TEST_LIBRARY: LibraryMaterial[] = [
  lib("lib-pine", "H3.2 90x45 framing pine", "m", 4.8, "Mitre 10"),
  lib("lib-gib", "GIB Standard 10mm 2400x1200", "sheet", 28.5, "PlaceMakers"),
  lib("lib-paint", "Resene exterior paint, 10L", "each", 165, "Resene"),
  lib("lib-primer", "Resene exterior primer, 4L", "each", 78, "Resene"),
  lib("lib-decking", "H3.2 decking 90x19, 3.6m", "each", 18.5, "ITM"),
  lib("lib-screws", "Stainless decking screws, box", "lot", 32, "Bunnings"),
];

// ---------------------------------------------------------------------------
// Universal checks — the structural + arithmetic invariants EVERY quote
// must satisfy, regardless of the job. These catch the failure modes
// that matter most: broken JSON shape, wrong maths, markup baked into
// line totals. They are non-negotiable — the runner hard-fails a case
// if any of these break.
// ---------------------------------------------------------------------------

/** Two currency amounts are "equal" within a 2c rounding tolerance. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.02;
}

export function universalChecks(profile: QuoteProfile): QuoteCheck[] {
  return [
    {
      label: "has at least one line item",
      pass: (q) => Array.isArray(q.line_items) && q.line_items.length > 0,
    },
    {
      label: "job_summary is a non-empty string",
      pass: (q) =>
        typeof q.job_summary === "string" && q.job_summary.trim().length > 0,
    },
    {
      label: "notes is an array",
      pass: (q) => Array.isArray(q.notes),
    },
    {
      label: "every line_total = quantity x unit_price (markup not baked in)",
      pass: (q) =>
        q.line_items.every((it) =>
          near(
            Number(it.line_total),
            Number(it.quantity) * Number(it.unit_price),
          ),
        ),
    },
    {
      label: "materials_subtotal = sum of material + other line totals",
      pass: (q) =>
        near(
          q.materials_subtotal,
          q.line_items
            .filter((it) => it.type !== "labour")
            .reduce((s, it) => s + Number(it.line_total), 0),
        ),
    },
    {
      label: "labour_subtotal = sum of labour line totals",
      pass: (q) =>
        near(
          q.labour_subtotal,
          q.line_items
            .filter((it) => it.type === "labour")
            .reduce((s, it) => s + Number(it.line_total), 0),
        ),
    },
    {
      label: "markup_amount = materials_subtotal x markup_pct%",
      pass: (q) =>
        near(q.markup_amount, q.materials_subtotal * (q.markup_pct / 100)),
    },
    {
      label: "subtotal_before_tax = materials + markup + labour",
      pass: (q) =>
        near(
          q.subtotal_before_tax,
          q.materials_subtotal + q.markup_amount + q.labour_subtotal,
        ),
    },
    {
      label: "tax_amount = subtotal_before_tax x tax_rate%",
      pass: (q) => near(q.tax_amount, q.subtotal_before_tax * (q.tax_rate / 100)),
    },
    {
      label: "total = subtotal_before_tax + tax_amount",
      pass: (q) => near(q.total, q.subtotal_before_tax + q.tax_amount),
    },
    {
      label: "currency / tax / markup echo the profile",
      pass: (q) =>
        q.currency === profile.currency &&
        near(q.tax_rate, profile.tax_rate) &&
        near(q.markup_pct, profile.default_markup_pct),
    },
  ];
}

// ---------------------------------------------------------------------------
// Per-job seed cases. SEEDS — replace / extend with real ones.
// ---------------------------------------------------------------------------

/** Does any line item description match `re`? */
const hasItem = (q: QuoteData, re: RegExp): boolean =>
  q.line_items.some((it) => re.test(it.description));

/** Does any line item of `type` exist? */
const hasType = (q: QuoteData, type: string): boolean =>
  q.line_items.some((it) => it.type === type);

/** Money as integer cents (exact comparison, no float tolerance). */
const cents = (n: unknown): number => Math.round(Number(n) * 100);

/**
 * EXACT check for a line the tradie priced out loud: some line of `type`
 * whose description matches `re` carries exactly `quantity` at exactly
 * `unitPrice`, and its line_total is that product to the cent. A "2 days at
 * $560" line re-expressed as 16 h at $70 fails on purpose: in production the
 * pricing policy only trusts the stated $560, so the hour version would be
 * repriced at the profile rate.
 */
export function statedLine(
  label: string,
  type: "material" | "labour" | "other" | "any",
  re: RegExp,
  quantity: number,
  unitPrice: number,
): QuoteCheck {
  return {
    label: `${label} — exactly ${quantity} × $${unitPrice.toFixed(2)} = $${(Math.round(quantity * unitPrice * 100) / 100).toFixed(2)}`,
    hard: true,
    pass: (q) =>
      q.line_items.some(
        (it) =>
          (type === "any" || it.type === type) &&
          re.test(it.description) &&
          Number(it.quantity) === quantity &&
          cents(it.unit_price) === cents(unitPrice) &&
          cents(it.line_total) === Math.round(quantity * unitPrice * 100),
      ),
  };
}

export const QUOTE_EVAL_CASES: QuoteEvalCase[] = [
  {
    id: "exterior-repaint",
    description:
      "Repaint the exterior weatherboards on a single-storey three-bedroom house in Tauranga. Wash down, scrape and sand any flaking areas, one coat of primer on bare timber, then two top coats. Client wants it done before winter.",
    checks: [
      { label: "includes paint as a material line", pass: (q) => hasItem(q, /paint/i) },
      { label: "includes labour", pass: (q) => hasType(q, "labour") },
      {
        label: "labour is the larger share (a repaint is labour-heavy)",
        pass: (q) => q.labour_subtotal > q.materials_subtotal,
      },
    ],
  },
  {
    id: "retaining-wall-missing-height",
    description:
      "Build a timber retaining wall along the back boundary, about twelve metres long. H4 posts and rails, tanalised sleepers for the wall itself.",
    checks: [
      {
        label: "flags the missing wall height in notes",
        pass: (q) => q.notes.some((n) => /height|how high|how tall/i.test(n)),
      },
      { label: "includes H4 treated timber", pass: (q) => hasItem(q, /h4/i) },
      { label: "includes labour", pass: (q) => hasType(q, "labour") },
    ],
  },
  {
    id: "deck-board-replacement",
    description:
      "Small back deck for Dave Thompson on Maple Street — looks like about eight of the decking boards are rotted through and need replacing. H3.2 90x19 to match the existing. Reckon two to three hours.",
    checks: [
      {
        label: "client name extracted (not left as a placeholder)",
        pass: (q) =>
          typeof q.client.name === "string" &&
          q.client.name.trim().length > 0 &&
          !/to be confirmed|tbc|tbd/i.test(q.client.name),
      },
      { label: "includes decking timber", pass: (q) => hasItem(q, /deck/i) },
      {
        label: "labour priced near the tradie's default rate",
        pass: (q) =>
          q.line_items.some(
            (it) =>
              it.type === "labour" &&
              it.unit_price >= 50 &&
              it.unit_price <= 110,
          ),
      },
    ],
  },
  {
    id: "fix-leaking-spouting",
    description:
      "Go out and sort a leaking spouting joint on the south side of a house, plus re-secure a couple of brackets that have come loose. Quick job.",
    checks: [
      { label: "includes labour", pass: (q) => hasType(q, "labour") },
      {
        label: "stays a small job (total under $800)",
        pass: (q) => q.total < 800,
      },
      {
        label: "keeps NZ term — does not rename 'spouting' to 'guttering'",
        pass: (q) => !hasItem(q, /guttering/i) && !/guttering/i.test(q.job_summary),
      },
    ],
  },

  // ── EXACT NUMBERS — the transcript states them, so they must come back
  //    to the cent (hard checks: a miss fails the case). ─────────────────
  {
    id: "exact-hourly-rate-and-part",
    description:
      "Replace the kitchen mixer tap and fix the leak under the sink for Aroha Ngata on Cameron Road, Tauranga. 3 hours at $95 an hour, and the Methven mixer is $289.",
    checks: [
      statedLine("labour at the stated hourly rate", "labour", /./, 3, 95),
      statedLine("the stated mixer price", "material", /mixer|tap|methven/i, 1, 289),
    ],
  },
  {
    id: "exact-day-rate-and-paint",
    description:
      "Paint the lounge and hallway ceilings. 2 days at $560 a day, and 3 tins of Resene ceiling white 10L at $189 a tin.",
    checks: [
      statedLine("labour kept as 2 days at the stated day rate", "labour", /./, 2, 560),
      statedLine("3 tins at the stated price", "material", /paint|resene|ceiling|white/i, 3, 189),
    ],
  },
  {
    id: "exact-stated-price-beats-library",
    description:
      "Supply and fix 14 sheets of 10mm GIB at $31.50 a sheet and 2 boxes of GIB screws at $35 a box. One day labour at $650.",
    checks: [
      // TEST_LIBRARY has GIB 10mm at $28.50 — the price the tradie SAID for
      // this job is $31.50 and must win.
      statedLine("GIB at the stated $31.50 (not the $28.50 library price)", "material", /gib(?!.*screw)|plasterboard/i, 14, 31.5),
      statedLine("screws at the stated box price", "material", /screw/i, 2, 35),
      statedLine("one day at the stated rate", "labour", /./, 1, 650),
    ],
  },
  {
    id: "exact-lump-sum-and-fee",
    description:
      "Assemble and install the client's kitset garden shed for a fixed price of $2,500, plus $150 for delivering the concrete blocks.",
    checks: [
      statedLine("the fixed price as one line", "any", /./, 1, 2500),
      statedLine("the stated delivery fee", "any", /deliver|block|cartage|freight/i, 1, 150),
    ],
  },
];
