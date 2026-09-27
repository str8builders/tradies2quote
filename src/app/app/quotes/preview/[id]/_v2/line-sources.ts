/**
 * Where each line's numbers came from, on the new job page. Pure: tested in
 * node.
 *
 * The classic editor badges each material line (calculated takeoff, from your
 * library, T2Q estimate), colours its edge by lib/lineConfidence, and links
 * the supplier's product page of the library item the line matched. The job
 * page's line list keeps those rules in a compact form: a small pill in words
 * for a quantity the calculator worked out, one for whose price it is, and
 * the supplier's page when the library knows it. A line with no price already
 * says "Needs price" (and one with guesses "Check this"), so neither gets a
 * pill of its own.
 */

import type { Tone } from "@/components/ui/styles";
import { lineConfidence } from "@/lib/lineConfidence";
import type { QuoteLineItem } from "@/lib/quote-types";
import type { LineLibraryItem } from "./types";

export type LineSourceKind = "calculated" | "library" | "supplier" | "catalogue" | "estimate";

export interface LineSource {
  kind: LineSourceKind;
  words: string;
  tone: Tone;
}

const SOURCES: Readonly<Record<LineSourceKind, LineSource>> = {
  calculated: { kind: "calculated", words: "Calculated", tone: "neutral" },
  library: { kind: "library", words: "Your library", tone: "ok" },
  supplier: { kind: "supplier", words: "Supplier price", tone: "ok" },
  catalogue: { kind: "catalogue", words: "Catalogue price", tone: "ok" },
  estimate: { kind: "estimate", words: "T2Q estimate", tone: "warn" },
};

/** An http(s) address to open, or null: stored text never becomes a javascript: or relative link. */
export function webAddress(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export interface SupplierLink {
  href: string;
  words: string;
}

export interface LineProvenance {
  /** At most two: how the quantity was got, then whose price it is. */
  sources: LineSource[];
  /** The matched library item's product page. */
  link: SupplierLink | null;
}

const NONE: LineProvenance = { sources: [], link: null };

/**
 * A line's pills and supplier link, from the classic editor's rules: only
 * material lines carry them; the calculator's quantity (not one it couldn't
 * work out); the price by lineConfidence, so a T2Q estimate (on the line or
 * saved in the library) says so and a trusted price names where it's from.
 */
export function lineProvenance(line: QuoteLineItem, item?: LineLibraryItem | null): LineProvenance {
  if (line.type !== "material") return NONE;
  const matched = line.library_id && item && item.id === line.library_id ? item : null;
  const sources: LineSource[] = [];
  if (line.is_calculated_takeoff && line.takeoff_status !== "blocked") sources.push(SOURCES.calculated);
  const confidence = lineConfidence(line, matched);
  if (confidence === "medium") sources.push(SOURCES.estimate);
  if (confidence === "high") {
    sources.push(
      line.price_source === "supplier_import"
        ? SOURCES.supplier
        : line.price_source === "catalogue_seed"
          ? SOURCES.catalogue
          : SOURCES.library,
    );
  }
  const href = webAddress(matched?.supplier_url);
  const supplier = matched?.supplier?.trim();
  const link = href ? { href, words: supplier ? `See it at ${supplier}` : "See it at the supplier" } : null;
  return sources.length === 0 && !link ? NONE : { sources, link };
}

/** A library row as the job page reads it (the materials table). */
export interface LibraryRow {
  id: string;
  name: string;
  default_unit_price: number | string | null;
  supplier?: string | null;
  supplier_url?: string | null;
  is_ai_estimated?: boolean | null;
}

/**
 * The library items the lines are matched to, loaded like the classic page's
 * library (supplier, product page, estimated or not) but only for the lines,
 * so the phone isn't sent the whole library's links.
 */
export function matchedLibrary(rows: readonly LibraryRow[], lines: readonly QuoteLineItem[]): LineLibraryItem[] {
  const ids = new Set(lines.flatMap((line) => (line.library_id ? [line.library_id] : [])));
  return rows
    .filter((row) => ids.has(row.id))
    .map((row) => {
      const price = row.default_unit_price == null ? null : Number(row.default_unit_price);
      return {
        id: row.id,
        name: row.name,
        default_unit_price: price !== null && Number.isFinite(price) ? price : null,
        supplier: row.supplier?.trim() || null,
        supplier_url: webAddress(row.supplier_url),
        is_ai_estimated: !!row.is_ai_estimated,
      };
    });
}
