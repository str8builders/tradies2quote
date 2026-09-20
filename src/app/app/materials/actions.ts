"use server";

import { isDeepStrictEqual } from "node:util";
import { isUUID } from "@/t2qcal/lib/calculation-record";
import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NZ_DEFAULTS } from "@/lib/quote-defaults";
import {
  buildMirrorQuoteLines,
  computeQuoteTotals,
} from "@/lib/materials/estimateToQuote";
import {
  toExGst,
  type ExtractedSupplierItem,
  type SupplierQuoteExtraction,
} from "@/lib/materials/quoteExtraction";
import { validateSupplierQuote } from "@/lib/materials/quoteValidation";
import type { QuoteData } from "@/lib/quote-types";
import type { ActionResult } from "./_state";

// `ActionResult` and `ACTION_INITIAL` live in `./_state.ts` — Next 16
// forbids non-async exports from `"use server"` files at runtime.

function readField(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function readOptional(form: FormData, key: string): string | null {
  const v = readField(form, key);
  return v.length > 0 ? v : null;
}

function parsePrice(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function createMaterial(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = readField(formData, "name");
  const unit = readField(formData, "unit");
  const priceRaw = readField(formData, "default_unit_price");
  const price = parsePrice(priceRaw);

  if (!name) return { error: "Name is required." };
  if (!unit) return { error: "Unit is required." };
  if (price === null) return { error: "Default price must be a non-negative number." };

  const { error } = await supabase.from("materials").insert({
    user_id: user.id,
    name,
    unit,
    default_unit_price: price,
    supplier: readOptional(formData, "supplier"),
    supplier_url: readOptional(formData, "supplier_url"),
    notes: readOptional(formData, "notes"),
    is_ai_estimated: false,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a material with that name." };
    }
    console.error("createMaterial failed", error);
    return { error: "Could not save material." };
  }

  revalidatePath("/app/materials");
  redirect("/app/materials");
}

export async function updateMaterial(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = readField(formData, "id");
  const name = readField(formData, "name");
  const unit = readField(formData, "unit");
  const priceRaw = readField(formData, "default_unit_price");
  const price = parsePrice(priceRaw);

  if (!id) return { error: "Missing material id." };
  if (!name) return { error: "Name is required." };
  if (!unit) return { error: "Unit is required." };
  if (price === null) return { error: "Default price must be a non-negative number." };

  const { error } = await supabase
    .from("materials")
    .update({
      name,
      unit,
      default_unit_price: price,
      supplier: readOptional(formData, "supplier"),
      supplier_url: readOptional(formData, "supplier_url"),
      notes: readOptional(formData, "notes"),
      is_ai_estimated: false,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a material with that name." };
    }
    console.error("updateMaterial failed", error);
    return { error: "Could not save changes." };
  }

  revalidatePath("/app/materials");
  redirect("/app/materials");
}

export async function deleteMaterial(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = readField(formData, "id");
  if (!id) return { error: "Missing material id." };

  const { error } = await supabase
    .from("materials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("deleteMaterial failed", error);
    return { error: "Could not delete." };
  }

  revalidatePath("/app/materials");
  redirect("/app/materials");
}

type ImportRow = {
  name: string;
  unit: string;
  default_unit_price: number;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
};

export async function importMaterials(
  rows: ImportRow[],
): Promise<{ inserted: number; updated: number; failed: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, updated: 0, failed: 0, error: "No rows to import." };
  }

  const { data: existing, error: selErr } = await supabase
    .from("materials")
    .select("id, name")
    .eq("user_id", user.id);

  if (selErr) {
    console.error("importMaterials select failed", selErr);
    return {
      inserted: 0,
      updated: 0,
      failed: rows.length,
      error: "Could not read existing library.",
    };
  }

  const byName = new Map<string, string>();
  for (const m of existing ?? []) {
    byName.set(m.name.trim().toLowerCase(), m.id);
  }

  const toInsert: Array<ImportRow & { user_id: string }> = [];
  const toUpdate: Array<{ id: string; row: ImportRow }> = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const matchId = byName.get(key);
    if (matchId) {
      toUpdate.push({ id: matchId, row: r });
    } else {
      toInsert.push({ ...r, user_id: user.id });
    }
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("materials")
      .insert(
        toInsert.map((r) => ({
          user_id: r.user_id,
          name: r.name,
          unit: r.unit,
          default_unit_price: r.default_unit_price,
          supplier: r.supplier,
          supplier_url: r.supplier_url,
          notes: r.notes,
          is_ai_estimated: false,
        })),
      )
      .select("id");
    if (error) {
      console.error("importMaterials insert failed", error);
      failed += toInsert.length;
    } else {
      inserted = data?.length ?? 0;
    }
  }

  for (const u of toUpdate) {
    const { error } = await supabase
      .from("materials")
      .update({
        unit: u.row.unit,
        default_unit_price: u.row.default_unit_price,
        supplier: u.row.supplier,
        supplier_url: u.row.supplier_url,
        notes: u.row.notes,
        is_ai_estimated: false,
      })
      .eq("id", u.id)
      .eq("user_id", user.id);
    if (error) {
      failed++;
    } else {
      updated++;
    }
  }

  revalidatePath("/app/materials");
  return { inserted, updated, failed };
}

// ───────────────────────────────────────────────────────────────────────
// Supplier-quote import (Wave 46).
//
// Sibling of importMaterials for rows the tradie reviewed off an AI-read
// supplier quote photo. Same dedupe-by-name + bulk-insert / serial-update
// shape, but the rows are marked is_ai_estimated + price_source so the
// library makes clear these prices came from a scanned quote and should
// be re-confirmed. The human has already reviewed every row in the UI.
// ───────────────────────────────────────────────────────────────────────

export type SupplierQuoteRow = {
  name: string;
  unit: string;
  default_unit_price: number;
  sku: string | null;
  notes: string | null;
};

export async function importSupplierQuoteItems(
  rows: SupplierQuoteRow[],
  supplier: string | null,
): Promise<{ inserted: number; updated: number; failed: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, updated: 0, failed: 0, error: "No rows to import." };
  }
  // Defensive server-side validation — the UI already enforces this, but
  // never trust the client. Drop rows with no name or a bad price.
  const clean = rows
    .map((r) => ({
      name: typeof r.name === "string" ? r.name.trim() : "",
      unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : "each",
      default_unit_price: Math.max(0, Number(r.default_unit_price) || 0),
      sku: typeof r.sku === "string" && r.sku.trim() ? r.sku.trim() : null,
      notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
    }))
    .filter((r) => r.name.length > 0);
  if (clean.length === 0) {
    return { inserted: 0, updated: 0, failed: 0, error: "No valid rows to import." };
  }

  const supplierName =
    typeof supplier === "string" && supplier.trim() ? supplier.trim() : null;

  const { data: existing, error: selErr } = await supabase
    .from("materials")
    .select("id, name")
    .eq("user_id", user.id);
  if (selErr) {
    console.error("importSupplierQuoteItems select failed", selErr);
    return {
      inserted: 0,
      updated: 0,
      failed: clean.length,
      error: "Could not read existing library.",
    };
  }

  const byName = new Map<string, string>();
  for (const m of existing ?? []) {
    byName.set(m.name.trim().toLowerCase(), m.id);
  }

  const toInsert: typeof clean = [];
  const toUpdate: Array<{ id: string; row: (typeof clean)[number] }> = [];
  for (const r of clean) {
    const matchId = byName.get(r.name.toLowerCase());
    if (matchId) toUpdate.push({ id: matchId, row: r });
    else toInsert.push(r);
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("materials")
      .insert(
        toInsert.map((r) => ({
          user_id: user.id,
          name: r.name,
          unit: r.unit,
          default_unit_price: r.default_unit_price,
          supplier: supplierName,
          sku: r.sku,
          notes: r.notes ?? "From scanned supplier quote — confirm price.",
          is_ai_estimated: true,
          price_source: "supplier_import",
          price_confidence: "medium",
          gst_included: false,
        })),
      )
      .select("id");
    if (error) {
      console.error("importSupplierQuoteItems insert failed", error);
      failed += toInsert.length;
    } else {
      inserted = data?.length ?? 0;
    }
  }

  for (const u of toUpdate) {
    const { error } = await supabase
      .from("materials")
      .update({
        unit: u.row.unit,
        default_unit_price: u.row.default_unit_price,
        supplier: supplierName,
        sku: u.row.sku,
        notes: u.row.notes ?? "From scanned supplier quote — confirm price.",
        is_ai_estimated: true,
        price_source: "supplier_import",
        price_confidence: "medium",
        gst_included: false,
      })
      .eq("id", u.id)
      .eq("user_id", user.id);
    if (error) failed++;
    else updated++;
  }

  console.log("[import-quote] saved", {
    userId: user.id,
    inserted,
    updated,
    failed,
  });
  revalidatePath("/app/materials");
  return { inserted, updated, failed };
}

// ───────────────────────────────────────────────────────────────────────
// Scan → quote (Wave 47).
//
// Turns a reviewed supplier-quote scan straight into a draft customer
// quote that MIRRORS the supplier quote 1:1 — same line items, same
// quantities, same prices, and (with markup = 0) the same total. No
// takeoff, no waste, no library substitution: "nothing changes in the
// numbers". The tradie lands on the normal review-your-quote screen and
// can fill in the client + edit from there.
// ───────────────────────────────────────────────────────────────────────

export type ScanQuoteLine = {
  name: string;
  unit: string;
  quantity: number;
  price: number;
  /** Printed line total as scanned — carried through for reconciliation. */
  line_total?: number | null;
};

export async function createQuoteFromScan(
  lines: ScanQuoteLine[],
  meta: {
    supplier: string | null;
    gstInclusive: boolean;
    /** Printed document totals as scanned (read-only source) for reconciliation. */
    subtotal?: number | null;
    gst?: number | null;
    total?: number | null;
    /** Tradie's explicit "create anyway" override for a flagged mismatch. */
    acknowledge?: boolean;
    /** #2 — strict-extraction verdict from the scan route (provenance). */
    extractionStatus?: "ok" | "needs_review" | "blocked";
    extractionReasons?: string[];
    /** Ops — rows the strict parser rejected (persisted for the review queue). */
    rowFailures?: Array<{ index: number; reason: string; raw_text: string | null }>;
    /** Ops — how many AI passes ran (1 = no retry). For the retry-rate metric. */
    extractionAttempts?: number;
    idempotencyKey?: string;
  },
): Promise<{ id?: string; error?: string; blocked?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (meta.idempotencyKey !== undefined && !isUUID(meta.idempotencyKey)) return {error: "Invalid quote request. Reload and try again."};

  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "No lines to turn into a quote." };
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("tax_label, tax_rate, currency")
    .eq("id", user.id)
    .maybeSingle();
  const currency = profileRow?.currency ?? NZ_DEFAULTS.currency;
  const taxLabel = profileRow?.tax_label ?? NZ_DEFAULTS.tax_label;
  const taxRate = Number(profileRow?.tax_rate ?? NZ_DEFAULTS.tax_rate);

  // Map the reviewed rows into the extractor's item shape so the mirror
  // builder is the single source of the pass-through rules.
  const items: ExtractedSupplierItem[] = lines
    .map((l) => ({
      name: typeof l.name === "string" ? l.name.trim() : "",
      unit: typeof l.unit === "string" && l.unit.trim() ? l.unit.trim() : "each",
      price:
        Number.isFinite(Number(l.price)) && Number(l.price) > 0
          ? Math.round(Number(l.price) * 100) / 100
          : null,
      sku: null,
      quantity:
        Number.isFinite(Number(l.quantity)) && Number(l.quantity) > 0
          ? Number(l.quantity)
          : null,
      pieces: null,
      source_line_total:
        Number.isFinite(Number(l.line_total)) && Number(l.line_total) > 0
          ? Math.round(Number(l.line_total) * 100) / 100
          : null,
      raw_text: null,
      confidence: 1,
    }))
    .filter((i) => i.name.length > 0);
  if (items.length === 0) {
    return { error: "No valid lines to turn into a quote." };
  }

  // Deterministic reconciliation — the server is the authority for money.
  // Block creation when the scanned totals don't reconcile with the lines,
  // unless the tradie has explicitly acknowledged the mismatch.
  const extraction: SupplierQuoteExtraction = {
    supplier: meta?.supplier ?? null,
    quote_number: null,
    currency,
    gst_inclusive: meta?.gstInclusive ?? false,
    items,
    subtotal: meta?.subtotal ?? null,
    gst: meta?.gst ?? null,
    total: meta?.total ?? null,
    notes: [],
  };
  const validation = validateSupplierQuote(extraction, {
    taxRate: taxRate / 100,
  });
  console.log("[import-quote] validation", {
    userId: user.id,
    severity: validation.severity,
    blocking: validation.blocking,
    acknowledged: meta?.acknowledge ?? false,
    recomputed: validation.recomputed,
    source: {
      subtotal: meta?.subtotal ?? null,
      gst: meta?.gst ?? null,
      total: meta?.total ?? null,
    },
  });
  if (validation.blocking && !meta?.acknowledge) {
    return {
      blocked: true,
      error:
        "The scanned totals don't reconcile with the line items. Fix the flagged lines (or tap “use supplier value”), then create again.",
    };
  }

  const lineItems = buildMirrorQuoteLines(items, {
    gstInclusive: meta?.gstInclusive ?? false,
    taxRate: taxRate / 100,
  });

  // markup 0 — a faithful mirror; total equals the supplier quote total.
  const totals = computeQuoteTotals(lineItems, {
    default_markup_pct: 0,
    tax_rate: taxRate,
  });

  const supplierName =
    typeof meta?.supplier === "string" && meta.supplier.trim()
      ? meta.supplier.trim()
      : null;

  const quoteData: QuoteData = {
    client: { name: "To be confirmed", address: null, email: null, phone: null, contact: null },
    job_summary: supplierName
      ? `Imported from ${supplierName} supplier quote`
      : "Imported from supplier quote",
    line_items: lineItems,
    materials_subtotal: totals.materials_subtotal,
    labour_subtotal: totals.labour_subtotal,
    markup_pct: 0,
    markup_amount: totals.markup_amount,
    subtotal_before_tax: totals.subtotal_before_tax,
    tax_amount: totals.tax_amount,
    total: totals.total,
    currency,
    tax_label: taxLabel,
    tax_rate: taxRate,
    terms: "",
    notes: [],
    // Read-only supplier source totals (ex-GST basis, matching the quote)
    // so the Review Quote editor can reconcile against the scanned quote.
    supplier_source: {
      supplier: supplierName,
      subtotal:
        meta?.subtotal != null
          ? toExGst(meta.subtotal, meta?.gstInclusive ?? false, taxRate / 100)
          : null,
      gst: meta?.gst ?? null,
      total: meta?.total ?? null,
      // PHASE 2 — raw printed document totals, EXACTLY as scanned and
      // never GST-converted, so the source can never be silently
      // overwritten and Review Quote can diff source vs computed.
      gst_inclusive: meta?.gstInclusive ?? false,
      source_subtotal: meta?.subtotal ?? null,
      source_gst: meta?.gst ?? null,
      source_total: meta?.total ?? null,
      source_discount: null,
      source_freight: null,
      source_adjustments: null,
      // Deterministic reconciliation verdict (computed above on the RAW
      // extraction, GST-aware), frozen onto the quote so the pre-send gate
      // can hard-block a critical mismatch.
      reconciliation_status: validation.reconciliation_status,
      reconciliation_reasons: validation.reconciliation_reasons,
      // #2 — strict-extraction verdict (scan-time provenance for the trace).
      extraction_status: meta?.extractionStatus,
      extraction_reasons: meta?.extractionReasons,
      // Ops — rejected rows + attempt count, persisted so the owner
      // extraction-review queue + metrics can read them without re-scanning.
      row_failures: meta?.rowFailures ?? [],
      extraction_attempts: meta?.extractionAttempts ?? 1,
    },
  };

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      ...(meta.idempotencyKey ? {id: meta.idempotencyKey} : {}),
      user_id: user.id,
      voice_transcript: supplierName
        ? `Scanned ${supplierName} supplier quote`
        : "Scanned supplier quote",
      status: "draft",
      quote_data: quoteData,
      ai_snapshot: quoteData,
      total_amount: totals.total,
      currency,
    })
    .select("id")
    .single();
  if (error?.code === "23505" && meta.idempotencyKey) {
    const {data: previous} = await supabase.from("quotes").select("id,quote_data").eq("id", meta.idempotencyKey).eq("user_id", user.id).maybeSingle();
    if (previous && isDeepStrictEqual(previous.quote_data, JSON.parse(JSON.stringify(quoteData)))) return {id: previous.id};
    return {error: "This request was already used for different working. Reopen your quotes before creating another."};
  }
  if (error || !data) {
    console.error("createQuoteFromScan insert failed", error);
    return { error: "Could not create the quote." };
  }

  const { error: iErr } = await supabase.from("quote_items").insert(
    lineItems.map((it) => ({
      quote_id: data.id,
      type: it.type,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      line_total: it.line_total,
    })),
  );
  if (iErr) {
    // The quote still renders fine — line items live in quote_data (JSON),
    // which inserted above; quote_items is a secondary/denormalised table.
    // So we DON'T fail the user or roll back a working quote. But the silent
    // console.error meant a quote_items inconsistency was invisible — report
    // it so we actually find out if this starts happening.
    console.error("createQuoteFromScan items insert failed", iErr);
    Sentry.captureException(iErr, {
      tags: { area: "createQuoteFromScan", step: "quote_items_insert" },
      extra: { quoteId: data.id, lineCount: lineItems.length },
    });
  }

  console.log("[import-quote] created quote from scan", {
    userId: user.id,
    quoteId: data.id,
    lines: lineItems.length,
  });

  return { id: data.id };
}
