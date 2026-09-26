"use server";

import { isDeepStrictEqual } from "node:util";
import { isUUID } from "@/t2qcal/lib/calculation-record";
import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NZ_DEFAULTS, resolveTaxLabel, resolveTaxRate } from "@/lib/quote-defaults";
import { preciseUnitPrice, unitPriceExGst } from "@/lib/materials/quoteExtraction";
import { MAX_PRICE_LIST_ROWS } from "@/lib/materials/priceList";
import {
  chunks,
  keepLater,
  keepMoreReliable,
  libraryPatch,
  matchSavedItems,
  mergeRepeatedNames,
  type ImportMaterialsResult,
  type ImportProblem,
  type LibraryImportRow,
  type MergedName,
  type SavedItem,
} from "@/lib/materials/libraryImport";
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
  /** Null = the file gave no unit: a new item is saved as "each", a saved one keeps its unit. */
  unit: string | null;
  /** Null = the file gave no price (blank / POA). Never overwrites a price. */
  default_unit_price: number | null;
  /** The supplier's product code: saved to the item's code, and matched on first. */
  sku?: string | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
};

export type { ImportMaterialsResult };

const textOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** Rows written per bulk request. */
const WRITE_CHUNK = 500;

type PendingInsert = { name: string; record: Record<string, unknown> };
type PendingUpdate = { id: string; name: string; savedName: string; patch: Record<string, unknown> };

function saveFailureReason(error: unknown): string {
  return (error as { code?: string } | null)?.code === "23505"
    ? "Already in your prices under that name"
    : "Couldn't be saved — try again";
}

/** One bulk write; null when it errored or threw (the caller then goes row by row). */
async function tryBulk(write: () => Promise<number>): Promise<number | null> {
  try {
    return await write();
  } catch (e) {
    console.error("materials bulk write failed; writing row by row", e);
    return null;
  }
}

async function tryOne(write: () => PromiseLike<{ error: unknown }>): Promise<unknown | null> {
  try {
    const { error } = await write();
    return error ?? null;
  } catch (e) {
    return e;
  }
}

/**
 * Write imported rows in bulk with a safety net. New items go in 500 at a
 * time; saved items are updated in bulk (an upsert on their id, grouped by
 * the fields they change, carrying the saved name so it never changes). If
 * a bulk write errors — or throws — that chunk is written row by row, so one
 * bad line can't sink the rest, and each row that still fails is named.
 */
async function writeLibraryRows(
  supabase: ServerClient,
  userId: string,
  inserts: PendingInsert[],
  updates: PendingUpdate[],
): Promise<{ inserted: number; updated: number; problems: ImportProblem[] }> {
  let inserted = 0;
  let updated = 0;
  const problems: ImportProblem[] = [];

  for (const part of chunks(inserts, WRITE_CHUNK)) {
    const bulk = await tryBulk(async () => {
      const { data, error } = await supabase
        .from("materials")
        .insert(part.map((p) => p.record))
        .select("id");
      if (error) throw error;
      return data?.length ?? part.length;
    });
    if (bulk !== null) {
      inserted += bulk;
      continue;
    }
    for (const p of part) {
      const error = await tryOne(() => supabase.from("materials").insert(p.record).select("id"));
      if (error) problems.push({ name: p.name, reason: saveFailureReason(error) });
      else inserted++;
    }
  }

  const groups = new Map<string, PendingUpdate[]>();
  for (const u of updates) {
    const key = Object.keys(u.patch).sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  for (const group of groups.values()) {
    for (const part of chunks(group, WRITE_CHUNK)) {
      const bulk = await tryBulk(async () => {
        const { data, error } = await supabase
          .from("materials")
          .upsert(
            part.map((u) => ({ id: u.id, user_id: userId, name: u.savedName, ...u.patch })),
            { onConflict: "id" },
          )
          .select("id");
        if (error) throw error;
        return data?.length ?? part.length;
      });
      if (bulk !== null) {
        updated += bulk;
        continue;
      }
      for (const u of part) {
        const error = await tryOne(() =>
          supabase.from("materials").update(u.patch).eq("id", u.id).eq("user_id", userId),
        );
        if (error) problems.push({ name: u.name, reason: saveFailureReason(error) });
        else updated++;
      }
    }
  }
  return { inserted, updated, problems };
}

/** The API returns at most this many rows per request. */
const LIBRARY_PAGE = 1000;

/**
 * The tradie's saved items, as much as matching needs: all of them, a page
 * at a time, so a big library (imported price lists run to thousands) is
 * matched in full instead of creating clashing duplicates past row 1,000.
 */
async function loadSavedItems(
  supabase: ServerClient,
  userId: string,
): Promise<SavedItem[] | null> {
  const items: SavedItem[] = [];
  for (let from = 0; ; from += LIBRARY_PAGE) {
    const { data, error } = await supabase
      .from("materials")
      .select("id, name, sku, notes")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + LIBRARY_PAGE - 1);
    if (error) {
      console.error("materials import: reading the library failed", error);
      return null;
    }
    const page = (data ?? []) as Array<Partial<SavedItem> & { id: string; name: string }>;
    for (const m of page) items.push({ id: m.id, name: m.name, sku: m.sku ?? null, notes: m.notes ?? null });
    if (page.length < LIBRARY_PAGE) return items;
  }
}

/**
 * Save a reviewed price list (CSV, Excel, PDF or photo) into the library.
 * Names listed twice are saved once (the last row); saved items are matched
 * by code first, then by name; blank cells never overwrite saved values and
 * the tradie's own notes are never replaced. Up to 5,000 rows per import.
 * Prices the AI read off a PDF or photo (`source: "scan"`) are marked as
 * scanned estimates to confirm, as the supplier-quote scan marks its prices.
 */
export async function importMaterials(
  rows: ImportRow[],
  options: { pricesIncludeGst?: boolean; source?: "file" | "scan" } = {},
): Promise<ImportMaterialsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const none = { inserted: 0, updated: 0, failed: 0, problems: [], merged: [], unchanged: 0 };
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ...none, error: "No rows to import." };
  }
  if (rows.length > MAX_PRICE_LIST_ROWS) {
    return {
      ...none,
      error: `That's ${rows.length.toLocaleString("en-NZ")} rows. Import up to ${MAX_PRICE_LIST_ROWS.toLocaleString("en-NZ")} at a time: split the file and import the rest after.`,
    };
  }

  // Defensive server-side validation — never trust the client's parse.
  const problems: ImportProblem[] = [];
  const valid: LibraryImportRow[] = [];
  for (const r of rows) {
    const name = textOrNull(r?.name);
    const price = r?.default_unit_price;
    const priceOk =
      price === null ||
      (typeof price === "number" && Number.isFinite(price) && price >= 0);
    if (!name) {
      problems.push({ name: "(no name)", reason: "No name" });
      continue;
    }
    if (!priceOk) {
      problems.push({ name, reason: "Price below zero or not a number" });
      continue;
    }
    valid.push({
      name,
      unit: textOrNull(r.unit),
      default_unit_price: price,
      sku: textOrNull(r.sku),
      supplier: textOrNull(r.supplier),
      supplier_url: textOrNull(r.supplier_url),
      notes: textOrNull(r.notes),
    });
  }
  const badRows = problems.length;
  if (valid.length === 0) {
    return { ...none, failed: badRows, problems, error: "No valid rows to import." };
  }

  // Library prices are ex-GST: convert once when the file's prices include it.
  const taxFraction = options.pricesIncludeGst
    ? await profileTaxFraction(supabase, user.id)
    : 0;
  const stored = (p: number | null) =>
    p === null ? null : unitPriceExGst(p, options.pricesIncludeGst === true, taxFraction);

  const { rows: clean, merged } = mergeRepeatedNames(
    valid.map((r) => ({ ...r, default_unit_price: stored(r.default_unit_price) })),
    keepLater,
  );

  const saved = await loadSavedItems(supabase, user.id);
  if (!saved) {
    return { ...none, failed: rows.length, problems, error: "Could not read existing library." };
  }

  // How a new price is labelled: exact from a file, or an estimate to
  // confirm when the AI read it off a PDF or photo.
  const priceStamp =
    options.source === "scan"
      ? { is_ai_estimated: true, price_source: "supplier_import", price_confidence: "medium" }
      : { is_ai_estimated: false };
  const { inserts, updates, superseded } = matchSavedItems(clean, saved);
  let unchanged = 0;
  const pendingUpdates: PendingUpdate[] = [];
  for (const { target, row } of updates) {
    const patch = libraryPatch(row, target, priceStamp);
    if (Object.keys(patch).length === 0) unchanged++;
    else pendingUpdates.push({ id: target.id, name: row.name, savedName: target.name, patch });
  }
  const written = await writeLibraryRows(
    supabase,
    user.id,
    inserts.map((r) => ({
      name: r.name,
      record: {
        user_id: user.id,
        name: r.name,
        unit: r.unit ?? "each",
        default_unit_price: r.default_unit_price,
        sku: r.sku,
        supplier: r.supplier,
        supplier_url: r.supplier_url,
        notes: r.notes,
        ...(r.default_unit_price === null ? { is_ai_estimated: false } : priceStamp),
      },
    })),
    pendingUpdates,
  );

  console.log("[import-materials] saved", {
    userId: user.id,
    inserted: written.inserted,
    updated: written.updated,
    unchanged,
    failed: badRows + written.problems.length,
    merged: merged.length,
  });
  revalidatePath("/app/materials");
  return {
    inserted: written.inserted,
    updated: written.updated,
    failed: badRows + written.problems.length,
    problems: [...problems, ...superseded, ...written.problems],
    merged,
    unchanged,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Supplier-quote import (Wave 46).
//
// Sibling of importMaterials for rows the tradie reviewed off an AI-read
// supplier quote. Same matching (code first, then name) and bulk writes
// with a row-by-row safety net, but the rows are marked is_ai_estimated +
// price_source so the library makes clear these prices came from a scanned
// quote and should be re-confirmed. The human has already reviewed every
// row in the UI.
// ───────────────────────────────────────────────────────────────────────

export type SupplierQuoteRow = {
  name: string;
  unit: string;
  default_unit_price: number;
  sku: string | null;
  notes: string | null;
  /** The scanner's confidence in the line (0..1): the clearer read wins a repeated name. */
  confidence?: number;
};

export type SupplierImportResult = {
  inserted: number;
  updated: number;
  failed: number;
  /** Names that couldn't be saved (the done screen lists them). */
  failedNames: string[];
  /** Names on more than one line: saved once, with the clearest price. */
  merged: MergedName[];
  error?: string;
};

export async function importSupplierQuoteItems(
  rows: SupplierQuoteRow[],
  supplier: string | null,
): Promise<SupplierImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const none = { inserted: 0, updated: 0, failed: 0, failedNames: [], merged: [] };
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ...none, error: "No rows to import." };
  }
  // Defensive server-side validation — the UI already enforces this, but
  // never trust the client. Drop rows with no name or no price above zero:
  // a library price is never overwritten with $0 or a discount.
  const supplierName =
    typeof supplier === "string" && supplier.trim() ? supplier.trim() : null;
  const valid: LibraryImportRow[] = rows
    .map((r) => ({
      name: typeof r.name === "string" ? r.name.trim() : "",
      unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : "each",
      default_unit_price: preciseUnitPrice(Number(r.default_unit_price)),
      sku: typeof r.sku === "string" && r.sku.trim() ? r.sku.trim() : null,
      supplier: supplierName,
      supplier_url: null,
      notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
      confidence: typeof r.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : undefined,
    }))
    .filter((r) => r.name.length > 0 && (r.default_unit_price ?? 0) > 0);
  if (valid.length === 0) {
    return { ...none, error: "No valid rows to import." };
  }

  // One name on two lines (a product delivered twice, or read twice): the
  // library keeps one price — the clearest read — instead of both inserts
  // tripping the one-name-per-item rule and failing together.
  const { rows: clean, merged } = mergeRepeatedNames(valid, keepMoreReliable);

  const saved = await loadSavedItems(supabase, user.id);
  if (!saved) {
    return {
      ...none,
      failed: clean.length,
      failedNames: clean.map((r) => r.name),
      merged,
      error: "Could not read existing library.",
    };
  }

  const scanned = {
    is_ai_estimated: true,
    price_source: "supplier_import",
    price_confidence: "medium",
    gst_included: false,
  };
  const { inserts, updates, superseded } = matchSavedItems(clean, saved);
  const written = await writeLibraryRows(
    supabase,
    user.id,
    inserts.map((r) => ({
      name: r.name,
      record: {
        user_id: user.id,
        name: r.name,
        unit: r.unit ?? "each",
        default_unit_price: r.default_unit_price,
        supplier: supplierName,
        sku: r.sku,
        notes: r.notes ?? "From scanned supplier quote — confirm price.",
        ...scanned,
      },
    })),
    // Only what the scan carried: keep the item's supplier, code and the
    // tradie's own notes when the scan didn't read them.
    updates.map(({ target, row }) => ({
      id: target.id,
      name: row.name,
      savedName: target.name,
      patch: libraryPatch(row, target, scanned),
    })),
  );

  console.log("[import-quote] saved", {
    userId: user.id,
    inserted: written.inserted,
    updated: written.updated,
    failed: written.problems.length,
    merged: merged.length,
  });
  revalidatePath("/app/materials");
  return {
    inserted: written.inserted,
    updated: written.updated,
    failed: written.problems.length,
    failedNames: written.problems.map((p) => p.name),
    // Two names with one supplier code land on the same saved item: one price is kept.
    merged: [...merged, ...superseded.map((p) => ({ name: p.name, count: 2 }))],
  };
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
