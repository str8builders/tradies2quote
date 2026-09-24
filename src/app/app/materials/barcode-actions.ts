"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/observability";
import { NZ_DEFAULTS } from "@/lib/quote-defaults";
import { preciseUnitPrice, unitPriceExGst } from "@/lib/materials/quoteExtraction";
import { isBarcodeUnit, normalizeBarcode } from "@/lib/materials/barcode";

// Barcode scanning for the material library. The library learns as the
// tradie scans: a code is looked up in THEIR items only, and a new product is
// saved with its code so the next scan is instant. No outside product lookup.
// Only async functions may be exported from a "use server" file; the types
// below are erased at build time.

/** A library item as the scanner shows it. Prices are ex GST. */
export type BarcodeMaterial = {
  id: string;
  name: string;
  unit: string | null;
  default_unit_price: number | null;
  category: string | null;
};

export type BarcodeLookupResult =
  | { ok: true; code: string; material: BarcodeMaterial | null }
  | { error: string };

export type SaveBarcodeInput = {
  code: string;
  /** Scanner format name (`ean_13`, `code_128`…); omit for a typed number. */
  format?: string | null;
  /** Attach the code to this existing library item instead of creating one. */
  materialId?: string | null;
  name?: string;
  unit?: string;
  price?: number | string;
  /** The typed price includes GST — library prices are stored ex GST. */
  priceIncludesGst?: boolean;
};

/** Which existing item stopped the save, so the scanner can offer it instead. */
export type BarcodeConflict = { kind: "barcode" | "name"; id: string; name: string };

export type SaveBarcodeResult =
  | { ok: true; material: BarcodeMaterial; attached: boolean; replaced: boolean }
  | { error: string; conflict?: BarcodeConflict };

const COLUMNS = "id, name, unit, default_unit_price, category";
const MAX_NAME_LENGTH = 120;
const MAX_PRICE = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOOKUP_FAILED = "We couldn't check that barcode. Check your connection and try again.";
const SAVE_FAILED = "We couldn't save that. Check your connection and try again.";
const NOT_IN_LIBRARY = "We couldn't find that item in your library.";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type MaterialRow = {
  id: string;
  name: string;
  unit: string | null;
  default_unit_price: number | string | null;
  category: string | null;
};
type DbError = { code?: string; message?: string; details?: string } | null;

function toMaterial(row: MaterialRow): BarcodeMaterial {
  const price = row.default_unit_price === null ? null : Number(row.default_unit_price);
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    default_unit_price: price !== null && Number.isFinite(price) ? price : null,
    category: row.category,
  };
}

function report(step: string, error: DbError): void {
  // Only the SQLSTATE: Postgres details can echo the row (names, prices).
  captureError(new Error(`barcode ${step} failed: ${error?.code ?? "unknown"}`), {
    route: "actions/materials/barcode",
    surface: "server_action",
  });
  console.error(`barcode ${step} failed`, { code: error?.code });
}

function barcodeTaken(holder: { id: string; name: string } | null): SaveBarcodeResult {
  if (!holder) return { error: "That barcode is already saved on another item in your library." };
  return {
    error: `That barcode is already saved on ${holder.name}.`,
    conflict: { kind: "barcode", id: holder.id, name: holder.name },
  };
}

function nameTaken(match: { id: string; name: string } | null): SaveBarcodeResult {
  if (!match) return { error: "You already have an item with that name. Use a different name." };
  return {
    error: `You already have "${match.name}" in your library. Add this barcode to it instead?`,
    conflict: { kind: "name", id: match.id, name: match.name },
  };
}

/** The signed-in owner's item carrying `code`, if any. Throws on a read error. */
async function findByBarcode(
  supabase: ServerClient,
  userId: string,
  code: string,
): Promise<MaterialRow | null> {
  const { data, error } = await supabase
    .from("materials")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("barcode", code)
    .maybeSingle();
  if (error) throw error;
  return (data as MaterialRow | null) ?? null;
}

/** Same-name item (trimmed, any case), the way the rest of the library dedupes. */
async function findByName(
  supabase: ServerClient,
  userId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from("materials").select("id, name").eq("user_id", userId);
  if (error) throw error;
  const key = name.trim().toLowerCase();
  return (data ?? []).find((m) => m.name.trim().toLowerCase() === key) ?? null;
}

/**
 * Which unique index a 23505 came from. Match the index name or the key
 * columns only — `details` also echoes the values, and a product can be
 * called "Barcode labels".
 */
function isBarcodeIndex(error: DbError): boolean {
  return (
    (error?.message ?? "").includes("materials_user_barcode_key") ||
    (error?.details ?? "").startsWith("Key (user_id, barcode)=")
  );
}

function parsePrice(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw.replace(/[$,\s]/g, ""))
        : Number.NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE) return null;
  return preciseUnitPrice(n);
}

async function taxFraction(supabase: ServerClient, userId: string): Promise<number> {
  const { data } = await supabase.from("profiles").select("tax_rate").eq("id", userId).maybeSingle();
  const pct = Number(data?.tax_rate ?? NZ_DEFAULTS.tax_rate);
  return Number.isFinite(pct) && pct >= 0 ? pct / 100 : NZ_DEFAULTS.tax_rate / 100;
}

/**
 * Look a scanned code up in the signed-in tradie's own library. Returns the
 * normalised code with the item, or `material: null` when it is new to them.
 */
export async function lookupBarcodeAction(
  code: string,
  format?: string | null,
): Promise<BarcodeLookupResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = normalizeBarcode(code, format);
  if (!parsed.ok) return { error: parsed.reason };

  try {
    // RLS already limits reads to the owner — plus the shared catalogue
    // (user_id null), which is not their library, hence the explicit filter.
    const row = await findByBarcode(supabase, user.id, parsed.code);
    return { ok: true, code: parsed.code, material: row ? toMaterial(row) : null };
  } catch (error) {
    report("lookup", error as DbError);
    return { error: LOOKUP_FAILED };
  }
}

/**
 * Save a scanned code to the tradie's library: attach it to an existing item
 * (`materialId`), or create a new item with a name, unit and price. The
 * owner always comes from the session. The unique indexes on (user_id,
 * barcode) and (user_id, name) are the authority; the reads before the write
 * only exist to explain a clash in plain words.
 */
export async function saveBarcodeMaterialAction(
  input: SaveBarcodeInput,
): Promise<SaveBarcodeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const source: Partial<SaveBarcodeInput> = input && typeof input === "object" ? input : {};
  const parsed = normalizeBarcode(source.code, source.format);
  if (!parsed.ok) return { error: parsed.reason };
  const code = parsed.code;

  if (source.materialId !== undefined && source.materialId !== null && source.materialId !== "") {
    return attachBarcode(supabase, user.id, code, source.materialId);
  }

  const name = typeof source.name === "string" ? source.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "Give it a name so you can find it next time." };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Keep the name under ${MAX_NAME_LENGTH} characters.` };
  }
  if (!isBarcodeUnit(source.unit)) return { error: "Pick a unit from the list." };
  const unit = source.unit;
  const price = parsePrice(source.price);
  if (price === null) return { error: "Enter a price above $0." };

  try {
    const holder = await findByBarcode(supabase, user.id, code);
    if (holder) return barcodeTaken(holder);
    const sameName = await findByName(supabase, user.id, name);
    if (sameName) return nameTaken(sameName);
  } catch (error) {
    report("save-check", error as DbError);
    return { error: SAVE_FAILED };
  }

  const storedPrice =
    source.priceIncludesGst === true
      ? unitPriceExGst(price, true, await taxFraction(supabase, user.id))
      : price;

  const { data, error } = await supabase
    .from("materials")
    .insert({
      user_id: user.id,
      name,
      unit,
      default_unit_price: storedPrice,
      barcode: code,
      is_ai_estimated: false,
      price_source: "user_library",
      price_confidence: "high",
      gst_included: false,
    })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      // Lost a race with another save: say which item holds the code or name.
      try {
        return isBarcodeIndex(error)
          ? barcodeTaken(await findByBarcode(supabase, user.id, code))
          : nameTaken(await findByName(supabase, user.id, name));
      } catch {
        return isBarcodeIndex(error) ? barcodeTaken(null) : nameTaken(null);
      }
    }
    report("insert", error);
    return { error: SAVE_FAILED };
  }

  revalidatePath("/app/materials");
  return { ok: true, material: toMaterial(data as MaterialRow), attached: false, replaced: false };
}

async function attachBarcode(
  supabase: ServerClient,
  userId: string,
  code: string,
  materialId: unknown,
): Promise<SaveBarcodeResult> {
  if (typeof materialId !== "string" || !UUID.test(materialId)) return { error: NOT_IN_LIBRARY };

  let current: (MaterialRow & { barcode: string | null }) | null;
  try {
    const holder = await findByBarcode(supabase, userId, code);
    if (holder && holder.id !== materialId) return barcodeTaken(holder);
    if (holder) return { ok: true, material: toMaterial(holder), attached: true, replaced: false };
    const { data, error } = await supabase
      .from("materials")
      .select(`${COLUMNS}, barcode`)
      .eq("id", materialId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    current = data as (MaterialRow & { barcode: string | null }) | null;
  } catch (error) {
    report("attach-check", error as DbError);
    return { error: SAVE_FAILED };
  }
  if (!current) return { error: NOT_IN_LIBRARY };
  const previousBarcode = current.barcode;

  const { data, error } = await supabase
    .from("materials")
    .update({ barcode: code })
    .eq("id", materialId)
    .eq("user_id", userId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      try {
        return barcodeTaken(await findByBarcode(supabase, userId, code));
      } catch {
        return barcodeTaken(null);
      }
    }
    report("attach", error);
    return { error: SAVE_FAILED };
  }
  if (!data) return { error: NOT_IN_LIBRARY };

  revalidatePath("/app/materials");
  return {
    ok: true,
    material: toMaterial(data as MaterialRow),
    attached: true,
    replaced: previousBarcode !== null && previousBarcode !== code,
  };
}
