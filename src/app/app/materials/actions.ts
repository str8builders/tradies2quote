"use server";

import { isDeepStrictEqual } from "node:util";
import { isUUID } from "@/t2qcal/lib/calculation-record";
import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NZ_DEFAULTS, resolveTaxLabel, resolveTaxRate } from "@/lib/quote-defaults";
import { preciseUnitPrice, unitPriceExGst } from "@/lib/materials/quoteExtraction";
import {
  buildScanQuote,
  type ScanQuoteLine as ScanQuoteLineInput,
  type ScanQuoteMeta,
} from "@/lib/materials/scanToQuote";
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
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  // Full precision — a 12.5c fixing must not be saved as 13c.
  return preciseUnitPrice(n);
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The tradie's tax rate as a fraction (profile stores a percentage). A blank
 * rate is the business country's default (UK 20 %), never NZ's 15 % for all —
 * the same rule the import screens state to the tradie.
 */
async function profileTaxFraction(supabase: ServerClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("tax_rate, country, currency")
    .eq("id", userId)
    .maybeSingle();
  return resolveTaxRate(data?.tax_rate, data?.country, data?.currency) / 100;
}

/**
 * Library prices are stored ex-GST. When the tradie says the price they
 * typed (or the file they imported) includes GST, convert it once, here.
 */
async function toStoredPrice(
  supabase: ServerClient,
  userId: string,
  price: number,
  includesGst: boolean,
): Promise<number> {
  if (!includesGst) return price;
  return unitPriceExGst(price, true, await profileTaxFraction(supabase, userId));
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
  const storedPrice = await toStoredPrice(
    supabase,
    user.id,
    price,
    formData.get("price_includes_gst") === "on",
  );

  const { error } = await supabase.from("materials").insert({
    user_id: user.id,
    name,
    unit,
    default_unit_price: storedPrice,
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
  const storedPrice = await toStoredPrice(
    supabase,
    user.id,
    price,
    formData.get("price_includes_gst") === "on",
  );

  const { error } = await supabase
    .from("materials")
    .update({
      name,
      unit,
      default_unit_price: storedPrice,
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
  /** Null = the file gave no price (blank / POA). Never overwrites a price. */
  default_unit_price: number | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
};

const textOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

export async function importMaterials(
  rows: ImportRow[],
  options: { pricesIncludeGst?: boolean } = {},
): Promise<{ inserted: number; updated: number; failed: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, updated: 0, failed: 0, error: "No rows to import." };
  }

  // Defensive server-side validation — never trust the client's parse.
  let failed = 0;
  const clean: ImportRow[] = [];
  for (const r of rows) {
    const name = textOrNull(r?.name);
    const unit = textOrNull(r?.unit);
    const price = r?.default_unit_price;
    const priceOk =
      price === null ||
      (typeof price === "number" && Number.isFinite(price) && price >= 0);
    if (!name || !unit || !priceOk) {
      failed++;
      continue;
    }
    clean.push({
      name,
      unit,
      default_unit_price: price,
      supplier: textOrNull(r.supplier),
      supplier_url: textOrNull(r.supplier_url),
      notes: textOrNull(r.notes),
    });
  }
  if (clean.length === 0) {
    return { inserted: 0, updated: 0, failed, error: "No valid rows to import." };
  }

  // Library prices are ex-GST: convert once when the file's prices include it.
  const taxFraction = options.pricesIncludeGst
    ? await profileTaxFraction(supabase, user.id)
    : 0;
  const stored = (p: number | null) =>
    p === null ? null : unitPriceExGst(p, options.pricesIncludeGst === true, taxFraction);

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

  const toInsert: ImportRow[] = [];
  const toUpdate: Array<{ id: string; row: ImportRow }> = [];
  for (const r of clean) {
    const matchId = byName.get(r.name.toLowerCase());
    if (matchId) toUpdate.push({ id: matchId, row: r });
    else toInsert.push(r);
  }

  let inserted = 0;
  let updated = 0;

  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("materials")
      .insert(
        toInsert.map((r) => ({
          user_id: user.id,
          name: r.name,
          unit: r.unit,
          default_unit_price: stored(r.default_unit_price),
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
    // Only the fields this file actually carries — a re-import must never
    // wipe the row's price, supplier, link or notes with blanks.
    const patch: Record<string, unknown> = { unit: u.row.unit };
    if (u.row.default_unit_price !== null) {
      patch.default_unit_price = stored(u.row.default_unit_price);
      patch.is_ai_estimated = false;
    }
    if (u.row.supplier) patch.supplier = u.row.supplier;
    if (u.row.supplier_url) patch.supplier_url = u.row.supplier_url;
    if (u.row.notes) patch.notes = u.row.notes;
    const { error } = await supabase
      .from("materials")
      .update(patch)
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
  // never trust the client. Drop rows with no name or no price above zero:
  // a library price is never overwritten with $0 or a discount.
  const clean = rows
    .map((r) => ({
      name: typeof r.name === "string" ? r.name.trim() : "",
      unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : "each",
      default_unit_price: preciseUnitPrice(Number(r.default_unit_price)),
      sku: typeof r.sku === "string" && r.sku.trim() ? r.sku.trim() : null,
      notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
    }))
    .filter((r) => r.name.length > 0 && r.default_unit_price > 0);
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
    // Only what the scan carried: keep the row's supplier, SKU and the
    // tradie's own notes when the scan didn't read them.
    const patch: Record<string, unknown> = {
      unit: u.row.unit,
      default_unit_price: u.row.default_unit_price,
      is_ai_estimated: true,
      price_source: "supplier_import",
      price_confidence: "medium",
      gst_included: false,
    };
    if (supplierName) patch.supplier = supplierName;
    if (u.row.sku) patch.sku = u.row.sku;
    if (u.row.notes) patch.notes = u.row.notes;
    const { error } = await supabase
      .from("materials")
      .update(patch)
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

export type ScanQuoteLine = ScanQuoteLineInput;

export async function createQuoteFromScan(
  lines: ScanQuoteLine[],
  meta: ScanQuoteMeta & {
    /** Tradie's explicit "create anyway" override for a flagged mismatch. */
    acknowledge?: boolean;
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
    .select("tax_label, tax_rate, currency, country")
    .eq("id", user.id)
    .maybeSingle();
  const currency = profileRow?.currency ?? NZ_DEFAULTS.currency;
  // The tradie's own label and rate by country (UK: VAT 20 %), not "GST" 15 %.
  const taxLabel = resolveTaxLabel(profileRow?.tax_label, profileRow?.country, profileRow?.currency);
  const taxRate = resolveTaxRate(profileRow?.tax_rate, profileRow?.country, profileRow?.currency);

  // Deterministic reconciliation + the 1:1 mirror — the server is the
  // authority for money. Unit prices keep full precision and the check
  // compares the raw printed values like with like (see scanToQuote.ts).
  const built = buildScanQuote(lines, meta, { currency, taxLabel, taxRate });
  if (!built.ok) return { error: built.error };
  const { validation, lineItems, quoteData } = built.value;

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
  // Block creation when the scanned totals don't reconcile with the lines,
  // unless the tradie has explicitly acknowledged the mismatch.
  if (validation.blocking && !meta?.acknowledge) {
    return {
      blocked: true,
      error:
        "The scanned totals don't reconcile with the line items. Fix the flagged lines (or tap “use supplier value”), then create again.",
    };
  }

  const supplierName = quoteData.supplier_source?.supplier ?? null;

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
      total_amount: quoteData.total,
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
