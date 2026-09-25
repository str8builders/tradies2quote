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
 *     false, else null. Pages that disagree add a visible warning.
 *   - status: the worst page wins (blocked > needs_review > ok).
 *   - notes / reasons / warnings: de-duplicated, prefixed "Photo n:" when
 *     there is more than one page.
 *   - the same page added twice (identical extracted content) is counted
 *     ONCE, with a visible warning. Summing both copies doubled every line
 *     AND every printed total, so reconciliation still said "ok". Identical
 *     photo files are also skipped on the device before upload (see
 *     scanDedupe.ts); this catches a page photographed twice.
 */
import { round2 } from "../quote-defaults";

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
    /** The line total exactly as printed (the extract route's field name). */
    source_line_total?: number | null;
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
  return round2(reported.reduce((a, b) => a + b, 0));
}

type Entry = { page: ScanPage; photo: number };

function prefixed(entries: Entry[], multi: boolean, pick: (p: ScanPage) => string[] | undefined): string[] {
  const out: string[] = [];
  for (const { page, photo } of entries) {
    for (const text of pick(page) ?? []) {
      const line = multi ? `Photo ${photo}: ${text}` : text;
      if (!out.includes(line)) out.push(line);
    }
  }
  return out;
}

/**
 * What a page SAYS — quote number, every line's numbers and the printed
 * totals — ignoring model noise (confidence, raw_text, notes). Two photos of
 * the same page read the same; two different pages practically never do.
 */
export function pageFingerprint(page: ScanPage): string | null {
  if (page.items.length === 0) return null;
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return JSON.stringify([
    norm(page.quote_number),
    page.items.map((it) => [norm(it.name), norm(it.unit), it.quantity ?? null, it.price ?? null, it.source_line_total ?? null]),
    page.subtotal ?? null,
    page.gst ?? null,
    page.total ?? null,
  ]);
}

export function mergeExtractions(pages: ScanPage[]): ScanPage {
  if (pages.length === 0) throw new Error("No scan results to merge.");
  if (pages.length === 1) return pages[0];

  const firstPhotoByFingerprint = new Map<string, number>();
  const entries: Entry[] = [];
  const duplicateNotes: string[] = [];
  pages.forEach((page, i) => {
    const photo = i + 1;
    const fingerprint = pageFingerprint(page);
    const first = fingerprint ? firstPhotoByFingerprint.get(fingerprint) : undefined;
    if (first !== undefined) {
      duplicateNotes.push(
        `Photo ${photo} is the same page as photo ${first} — its lines were only counted once.`,
      );
      return;
    }
    if (fingerprint) firstPhotoByFingerprint.set(fingerprint, photo);
    entries.push({ page, photo });
  });

  const kept = entries.map((e) => e.page);
  const items = kept.flatMap((p) => p.items);
  const rowFailures: NonNullable<ScanPage["row_failures"]> = [];
  let offset = 0;
  for (const page of kept) {
    for (const f of page.row_failures ?? []) rowFailures.push({ ...f, index: f.index + offset });
    offset += page.items.length;
  }
  const gstVotes = kept.map((p) => p.gst_inclusive);
  const gstNotes =
    gstVotes.includes(true) && gstVotes.includes(false)
      ? [
          `The photos disagree on whether prices include GST (${entries
            .filter((e) => e.page.gst_inclusive !== null)
            .map((e) => `photo ${e.photo}: ${e.page.gst_inclusive ? "including" : "excluding"}`)
            .join(", ")}). Check the “Prices include GST” setting.`,
        ]
      : [];
  const status = kept.reduce<"ok" | "needs_review" | "blocked">((worst, p) => {
    const s = p.extraction_status ?? "ok";
    return STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst;
  }, "ok");
  return {
    supplier: firstText(kept.map((p) => p.supplier)),
    quote_number: firstText(kept.map((p) => p.quote_number)),
    currency: firstText(kept.map((p) => p.currency)),
    gst_inclusive: gstVotes.includes(true) ? true : gstVotes.includes(false) ? false : null,
    items,
    subtotal: sumReported(kept.map((p) => p.subtotal)),
    gst: sumReported(kept.map((p) => p.gst)),
    total: sumReported(kept.map((p) => p.total)),
    notes: prefixed(entries, true, (p) => p.notes),
    extraction_status: status,
    extraction_reasons: prefixed(entries, true, (p) => p.extraction_reasons),
    row_failures: rowFailures,
    warnings: [...duplicateNotes, ...gstNotes, ...prefixed(entries, true, (p) => p.warnings)],
    attempts: kept.reduce((n, p) => n + (p.attempts ?? 1), 0),
  };
}

/** Short human label for the chosen photo set. */
export function photoSetLabel(files: Array<{ name: string }>): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return `${files.length} photos`;
}
