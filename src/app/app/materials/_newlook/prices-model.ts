/**
 * New-look Prices page (the material library): how a saved material becomes
 * a list row, and search. Pure, tested in node.
 */

import type { LibraryMaterial } from "@/lib/quote-types";

/** A `materials` row as the page selects it (the old page's columns). */
export interface MaterialRecord {
  id: string;
  name: string;
  unit: string | null;
  default_unit_price: number | string | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
  usage_count: number | string | null;
  is_ai_estimated: boolean | null;
  last_used_at: string | null;
}

/** The old page's mapping from a row to a library item, unchanged. */
export function toLibraryMaterial(row: MaterialRecord): LibraryMaterial {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    default_unit_price: row.default_unit_price !== null ? Number(row.default_unit_price) : null,
    supplier: row.supplier,
    supplier_url: row.supplier_url,
    notes: row.notes,
    usage_count: Number(row.usage_count) || 0,
    is_ai_estimated: !!row.is_ai_estimated,
    last_used_at: row.last_used_at,
  };
}

export interface PriceRow {
  id: string;
  /** Tapping a row opens the existing edit page. */
  href: string;
  name: string;
  unit: string;
  /** Null when there is no price yet (none saved, or zero). */
  price: number | null;
  /** The price came from a T2Q estimate, not the tradie. */
  estimated: boolean;
  supplier: string | null;
}

/** A price counts once it is above zero (the dashboard counts priced items the same way). */
export function hasPrice(price: number | null | undefined): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

export function toPriceRow(material: LibraryMaterial): PriceRow {
  const price = hasPrice(material.default_unit_price) ? material.default_unit_price : null;
  return {
    id: material.id,
    href: `/app/materials/${material.id}/edit`,
    name: material.name,
    unit: material.unit?.trim() || "each",
    price,
    estimated: Boolean(material.is_ai_estimated) && price !== null,
    supplier: material.supplier?.trim() || null,
  };
}

/** "per sheet · Mitre 10 · estimated price" */
export function priceRowSubtitle(row: PriceRow): string {
  const parts = [row.unit === "each" ? "each" : `per ${row.unit}`];
  if (row.supplier) parts.push(row.supplier);
  if (row.estimated) parts.push("estimated price, check it");
  return parts.join(" · ");
}

/** Every word typed must appear in the name, supplier or unit (any case, any order). */
export function searchPriceRows(rows: readonly PriceRow[], query: string): PriceRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((row) => {
    const haystack = `${row.name} ${row.supplier ?? ""} ${row.unit}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** "24 prices saved · 3 with no price yet" */
export function priceSummary(rows: readonly PriceRow[]): string {
  const total = rows.length;
  const missing = rows.filter((row) => row.price === null).length;
  const saved = `${total} ${total === 1 ? "item" : "items"} saved`;
  return missing > 0 ? `${saved} · ${missing} with no price yet` : saved;
}

/** Arrived straight back from "Copy from a supplier's website" (the old page's banner rule). */
export function cameFromCapture(referer: string | null | undefined): boolean {
  if (!referer) return false;
  try {
    return new URL(referer).pathname === "/app/materials/capture";
  } catch {
    return false;
  }
}
