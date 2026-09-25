// ─────────────────────────────────────────────────────────────────────────
// Clarification layer.
//
// Turns "this scope can't run because X is missing" into a concrete
// question the tradie can answer. We deliberately produce small,
// answerable questions tied to a specific field — never an open-ended
// "tell us more". The orchestrator runs this whenever validate.ts
// returns `blocked`, OR whenever a critical extraction field is null.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ClarificationQuestion,
  ExtractedExtraction,
  ScopeType,
} from "./schemas";

type FieldQuestion = {
  field: string;
  question: string;
  hint?: string;
  blocking: boolean;
  suggestions?: string[];
  unit?: string;
};

/**
 * Per-scope question banks. Keyed on the field name in the extraction.
 * Order is the order the orchestrator surfaces them in.
 */
const QUESTION_BANK: Record<ScopeType, FieldQuestion[]> = {
  deck: [
    {
      field: "length_m",
      question: "What's the deck length?",
      blocking: true,
      unit: "m",
      suggestions: ["3", "4.8", "6"],
    },
    {
      field: "width_m",
      question: "What's the deck width?",
      blocking: true,
      unit: "m",
      suggestions: ["2.4", "3", "4"],
    },
    {
      field: "joist_spacing_mm",
      question: "What joist spacing?",
      blocking: false,
      unit: "mm",
      suggestions: ["300", "400", "450", "600"],
      hint: "Defaults to 450mm — NZ residential standard.",
    },
    {
      field: "include_piles",
      question: "Is this on piles or ground level?",
      blocking: false,
      suggestions: ["On piles", "Ground level"],
    },
  ],
  cladding: [
    {
      field: "length_m",
      question: "What's the total wall length to clad?",
      blocking: true,
      unit: "m",
      suggestions: ["6", "10", "15"],
    },
    {
      field: "height_m",
      question: "What's the wall height?",
      blocking: false,
      unit: "m",
      suggestions: ["2.4", "2.7", "3"],
      hint: "Defaults to 2.4m.",
    },
    {
      field: "material_spec",
      question: "What cladding profile?",
      blocking: false,
      suggestions: [
        "180mm bevel-back weatherboard",
        "Linea (150mm coverage)",
        "Shadowclad",
      ],
    },
    {
      field: "coverage_mm",
      question: "What's the board cover width?",
      blocking: false,
      unit: "mm",
      suggestions: ["135", "150", "180"],
    },
  ],
  framing: [
    {
      field: "length_m",
      question: "What's the wall length?",
      blocking: true,
      unit: "m",
    },
    {
      field: "height_m",
      question: "What's the wall height?",
      blocking: true,
      unit: "m",
      suggestions: ["2.4", "2.7"],
    },
    {
      field: "spacing_mm",
      question: "What stud spacing?",
      blocking: false,
      unit: "mm",
      suggestions: ["400", "600"],
      hint: "Defaults to 600mm.",
    },
  ],
  roofing: [
    {
      field: "area_m2",
      question: "What's the roof plan area (footprint, not actual)?",
      blocking: false,
      unit: "m²",
    },
    {
      field: "length_m",
      question: "What's the roof length?",
      blocking: false,
      unit: "m",
    },
    {
      field: "width_m",
      question: "What's the roof width?",
      blocking: false,
      unit: "m",
    },
    {
      field: "pitch_deg",
      question: "What's the roof pitch?",
      blocking: false,
      unit: "degrees",
      suggestions: ["3", "10", "15", "25", "30"],
      hint: "Defaults to 15° if unsure.",
    },
    {
      field: "material_spec",
      question: "What roofing material?",
      blocking: false,
      suggestions: ["Colorsteel long-run", "Tile", "Membrane"],
    },
  ],
  lining: [
    {
      field: "area_m2",
      question: "What's the lining area?",
      blocking: false,
      unit: "m²",
    },
    {
      field: "length_m",
      question: "What's the wall length?",
      blocking: false,
      unit: "m",
    },
    {
      field: "height_m",
      question: "What's the ceiling height?",
      blocking: false,
      unit: "m",
    },
    {
      field: "material_spec",
      question: "What sheet — Standard 10mm, Aqualine 13mm, Fyreline?",
      blocking: false,
      suggestions: ["Standard 10mm", "Aqualine 13mm", "Fyreline 13mm"],
    },
  ],
  insulation: [
    {
      field: "wall_kind",
      question:
        "Are these exterior walls? Insulation is quoted for exterior walls only.",
      blocking: true,
      suggestions: ["Yes — exterior walls", "No — interior only"],
      hint: "Interior-only walls aren't insulated in this takeoff.",
    },
    {
      field: "area_m2",
      question: "What's the area to insulate?",
      blocking: false,
      unit: "m²",
    },
    {
      field: "material_spec",
      question: "What R-value?",
      blocking: false,
      suggestions: ["R2.2 walls", "R3.6 ceiling", "R1.8 floor"],
    },
  ],
  fencing: [
    {
      field: "length_m",
      question: "How many lineal metres of fence?",
      blocking: true,
      unit: "m",
    },
    {
      field: "height_m",
      question: "How tall?",
      blocking: false,
      unit: "m",
      suggestions: ["1.2", "1.8", "2"],
    },
    {
      field: "material_spec",
      question: "Style?",
      blocking: false,
      suggestions: ["Paling fence", "Post & rail", "Picket"],
    },
  ],
  concrete: [
    {
      field: "length_m",
      question: "What's the pour length?",
      blocking: false,
      unit: "m",
    },
    {
      field: "width_m",
      question: "What's the pour width?",
      blocking: false,
      unit: "m",
    },
    {
      field: "height_m",
      question: "Slab thickness?",
      blocking: false,
      unit: "mm",
      suggestions: ["100", "125", "150"],
    },
    {
      field: "volume_m3",
      question: "Or just the total m³?",
      blocking: false,
      unit: "m³",
    },
  ],
  fixing: [
    {
      field: "length_m",
      question: "How many lineal metres?",
      blocking: true,
      unit: "m",
    },
    {
      field: "material_spec",
      question: "Skirting, architrave or scotia?",
      blocking: false,
      suggestions: ["Skirting", "Architrave", "Scotia"],
    },
  ],
  generic: [
    {
      field: "material_spec",
      question: "What's the material, and how much do you need?",
      blocking: true,
    },
  ],
};

/**
 * Generate clarification questions for a scope's extraction. Pulls
 * from the bank above, filters to only the questions whose target
 * field is currently null/missing. `problems` are fields the validator
 * refused as implausible (validate.ts) — each becomes a blocking question
 * quoting the exact number that's wrong ("Deck length 150 m is more than
 * 100 m — check it."), so a refused size is never presented as missing.
 */
export function buildClarifications(
  scope: ScopeType,
  ext: ExtractedExtraction,
  problems: ReadonlyArray<{ field: string; reason: string }> = [],
): { questions: ClarificationQuestion[]; blocking: boolean } {
  const bank = QUESTION_BANK[scope] ?? [];
  const missing: ClarificationQuestion[] = [];
  for (const p of problems) {
    const banked = bank.find((q) => q.field === p.field);
    missing.push({
      id: `${scope}.${p.field}`,
      scope,
      field: p.field,
      question: p.reason,
      blocking: true,
      unit: banked?.unit,
    });
  }
  for (const q of bank) {
    if (problems.some((p) => p.field === q.field)) continue;
    if (!isFieldMissing(ext, q.field)) continue;
    missing.push({
      id: `${scope}.${q.field}`,
      scope,
      field: q.field,
      question: q.question,
      hint: q.hint,
      blocking: q.blocking,
      suggestions: q.suggestions,
      unit: q.unit,
    });
  }
  const blocking = missing.some((m) => m.blocking);
  return { questions: missing, blocking };
}

function isFieldMissing(ext: ExtractedExtraction, field: string): boolean {
  // First check the named dimension fields.
  const dims = ext.dimensions as Record<string, number | null | undefined>;
  if (field in dims) {
    const v = dims[field];
    return v === null || v === undefined || !Number.isFinite(v) || v <= 0;
  }
  // Top-level fields.
  switch (field) {
    case "spacing_mm":
    case "joist_spacing_mm": {
      return (
        ext.spacing_mm === null ||
        ext.spacing_mm === undefined ||
        !Number.isFinite(ext.spacing_mm) ||
        ext.spacing_mm <= 0
      );
    }
    case "material_spec":
      return !ext.material_spec || ext.material_spec.trim() === "";
    case "wall_kind": {
      // Resolved when we have positive exterior evidence (statement or
      // scan exterior run) — or a definite "interior", which is a final
      // answer (the block reason explains it), not an open question.
      const run = ext.exterior_wall_run_m;
      if (Number.isFinite(run ?? NaN) && (run ?? 0) > 0) return false;
      return ext.wall_kind !== "exterior" && ext.wall_kind !== "interior";
    }
    case "coverage_mm":
      return (
        ext.coverage_mm === null ||
        ext.coverage_mm === undefined ||
        !Number.isFinite(ext.coverage_mm) ||
        ext.coverage_mm <= 0
      );
    case "include_piles":
      // Always offer when not in the notes.
      return !ext.notes.some((n) => /\b(?:piles?|ground[-\s]?level)\b/i.test(n));
    default:
      return false;
  }
}
