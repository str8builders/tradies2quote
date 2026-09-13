/**
 * Multi-photo supplier-quote scans.
 *
 * A quote or invoice often runs to several pages, and a tradie may also
 * photograph a few price tags or a screen in one go. Each photo is read by
 * `/api/materials/extract-quote` on its own; this helper folds those page
 * results into the single shape the review step already understands, so the
 * review/save/create code did not have to change.
 *
 * Rules (page order is the order the photos were added):
 *   - supplier / quote number / currency: first non-empty value wins.
 *   - items: concatenated; row_failures re-indexed onto the merged list.
 *   - subtotal / gst / total: one page reporting them → that value; several
 *     pages reporting them → summed (the totals validator still reconciles
 *     the merged figures against the lines, so a "carried forward" running
 *     total is caught there and flagged for review rather than trusted).
 *   - gst_inclusive: true if any page says so, else false if any page says
 *     false, else null.
 *   - status: the worst page wins (blocked > needs_review > ok).
 *   - notes / reasons / warnings: de-duplicated, prefixed "Photo n:" when
 *     there is more than one page.
 */
export type ScanPage = {
  supplier: string | null;
  quote_number?: string | null;
  currency: string | null;
  gst_inclusive: boolean | null;
  items: Array<{
    name: string;
    unit: string;
    quantity?: number | null;
    pieces?: number | null;
    price: number | null;
    line_total?: number | null;
    sku: string | null;
    confidence: number;
    raw_text?: string | null;
  }>;
  subtotal?: number | null;
  gst?: number | null;
  total?: number | null;
  notes: string[];
  extraction_status?: "ok" | "needs_review" | "blocked";
  extraction_reasons?: string[];
  row_failures?: Array<{ index: number; reason: string; raw_text: string | null }>;
  warnings?: string[];
  attempts?: number;
};

const STATUS_RANK = { ok: 0, needs_review: 1, blocked: 2 } as const;

function firstText(values: Array<string | null | undefined>): string | null {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function sumReported(values: Array<number | null | undefined>): number | null {
  const reported = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (reported.length === 0) return null;
  if (reported.length === 1) return reported[0];
  return Math.round(reported.reduce((a, b) => a + b, 0) * 100) / 100;
}

function prefixed(pages: ScanPage[], pick: (p: ScanPage) => string[] | undefined): string[] {
  const out: string[] = [];
  pages.forEach((page, i) => {
    for (const text of pick(page) ?? []) {
      const line = pages.length > 1 ? `Photo ${i + 1}: ${text}` : text;
      if (!out.includes(line)) out.push(line);
    }
  });
  return out;
}

export function mergeExtractions(pages: ScanPage[]): ScanPage {
  if (pages.length === 0) throw new Error("No scan results to merge.");
  if (pages.length === 1) return pages[0];
  const items = pages.flatMap((p) => p.items);
  const rowFailures: NonNullable<ScanPage["row_failures"]> = [];
  let offset = 0;
  for (const page of pages) {
    for (const f of page.row_failures ?? []) rowFailures.push({ ...f, index: f.index + offset });
    offset += page.items.length;
  }
  const gstVotes = pages.map((p) => p.gst_inclusive);
  const status = pages.reduce<"ok" | "needs_review" | "blocked">((worst, p) => {
    const s = p.extraction_status ?? "ok";
    return STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst;
  }, "ok");
  return {
    supplier: firstText(pages.map((p) => p.supplier)),
    quote_number: firstText(pages.map((p) => p.quote_number)),
    currency: firstText(pages.map((p) => p.currency)),
    gst_inclusive: gstVotes.includes(true) ? true : gstVotes.includes(false) ? false : null,
    items,
    subtotal: sumReported(pages.map((p) => p.subtotal)),
    gst: sumReported(pages.map((p) => p.gst)),
    total: sumReported(pages.map((p) => p.total)),
    notes: prefixed(pages, (p) => p.notes),
    extraction_status: status,
    extraction_reasons: prefixed(pages, (p) => p.extraction_reasons),
    row_failures: rowFailures,
    warnings: prefixed(pages, (p) => p.warnings),
    attempts: pages.reduce((n, p) => n + (p.attempts ?? 1), 0),
  };
}

/** Short human label for the chosen photo set. */
export function photoSetLabel(files: Array<{ name: string }>): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return `${files.length} photos`;
}
