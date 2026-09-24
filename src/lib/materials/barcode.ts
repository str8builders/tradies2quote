/**
 * Product barcodes for the material library.
 *
 * A tradie scans a box of screws or a tube of sealant; the code is stored on
 * THEIR library item so the next scan finds it instantly. There is no product
 * database behind this — the library learns as they scan.
 *
 * Pure and shared by the scanner (client) and the server actions, so a code
 * is normalised the same way on both sides:
 *   - EAN-13 / EAN-8 / UPC-A / UPC-E check digits are verified, so a misread
 *     or a typo is caught instead of saved.
 *   - UPC-A (12 digits) is stored as EAN-13 with a leading 0 — scanners report
 *     the same product both ways, and one library item must match both. UPC-E
 *     (8 digits) is stored the same way, as the EAN-13 of the UPC-A it
 *     expands to: the WebAssembly reader reports it expanded, a phone's own
 *     detector and a typed number as the 8 printed digits.
 *   - Everything else (Code 128, Code 39, ITF, QR…) is kept as printed.
 *   - Every stored code is 4–64 printable ASCII characters with no leading or
 *     trailing space — the same rule as the `materials_barcode_format` check
 *     constraint (supabase/migrations/20260925_materials_barcode.sql).
 */

export const BARCODE_MIN_LENGTH = 4;
export const BARCODE_MAX_LENGTH = 64;

/** The units offered for a scanned product. "each" is the default. */
export const BARCODE_UNITS = [
  "each",
  "m",
  "m²",
  "box",
  "bag",
  "sheet",
  "L",
  "kg",
  "roll",
  "pack",
] as const;

export type BarcodeUnit = (typeof BARCODE_UNITS)[number];

export function isBarcodeUnit(unit: unknown): unit is BarcodeUnit {
  return typeof unit === "string" && (BARCODE_UNITS as readonly string[]).includes(unit);
}

export type NormalizedBarcode =
  | { ok: true; code: string }
  | { ok: false; reason: string };

const REASON = {
  empty: "Scan a barcode or type the number under it.",
  check: "Those numbers don't add up to a real barcode. Check each digit and try again.",
  misread: "That barcode didn't read properly. Try again, or type the number under it.",
  tooShort: "That code is too short to be a product barcode.",
  tooLong: `That code is too long to save. Barcodes can be up to ${BARCODE_MAX_LENGTH} characters.`,
  badChars:
    "That code has characters we can't save. Type the number printed under the barcode instead.",
} as const;

/** Printable ASCII (space to ~) with a non-space first and last character. */
const STORABLE = /^[!-~](?:[ -~]*[!-~])?$/;

/** True when `code` satisfies the database's `materials_barcode_format` rule. */
export function isStorableBarcode(code: string): boolean {
  return (
    code.length >= BARCODE_MIN_LENGTH &&
    code.length <= BARCODE_MAX_LENGTH &&
    STORABLE.test(code)
  );
}

/**
 * GS1 modulo-10 check digit for `body` (the digits before the check digit).
 * Weight 3 on the digit next to the check digit, alternating with 1 leftwards
 * — the same rule for EAN-13, EAN-8, UPC-A and GTIN-14.
 */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidCheckDigit(digits: string): boolean {
  return (
    /^\d{2,}$/.test(digits) &&
    gs1CheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1])
  );
}

/**
 * Expand an 8-digit UPC-E (number system 0/1, six digits, check digit) to the
 * 12-digit UPC-A it stands for. The check digit is carried over unchanged —
 * it is the UPC-A check digit. Null when `code` is not UPC-E shaped.
 */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const system = code[0];
  const d = code.slice(1, 7);
  const check = code[7];
  const last = d[5];
  let body: string;
  if (last === "0" || last === "1" || last === "2") {
    body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  } else if (last === "3") {
    body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  } else if (last === "4") {
    body = `${d.slice(0, 4)}00000${d[4]}`;
  } else {
    body = `${d.slice(0, 5)}0000${last}`;
  }
  return `${system}${body}${check}`;
}

function isValidUpcE(code: string): boolean {
  const upcA = expandUpcE(code);
  return upcA !== null && hasValidCheckDigit(upcA);
}

/** Scanner formats (BarcodeDetector names) that carry an EAN/UPC number. */
const RETAIL_FORMATS = new Set(["ean_13", "ean_8", "upc_a", "upc_e", "ean_upc", "isbn"]);

/** Formats with no check digit: one read can be a misread. */
const NEEDS_SECOND_READ = new Set(["code_39", "code_93", "codabar", "itf"]);

function checkedRetail(digits: string, format: string | null): NormalizedBarcode | null {
  if (digits.length === 13) {
    return hasValidCheckDigit(digits) ? { ok: true, code: digits } : { ok: false, reason: REASON.check };
  }
  if (digits.length === 12) {
    return hasValidCheckDigit(digits)
      ? { ok: true, code: `0${digits}` }
      : { ok: false, reason: REASON.check };
  }
  if (digits.length === 8) {
    if (format !== "ean_8" && isValidUpcE(digits)) {
      return { ok: true, code: `0${expandUpcE(digits)}` };
    }
    if (format === "upc_e") return { ok: false, reason: REASON.check };
    return hasValidCheckDigit(digits) ? { ok: true, code: digits } : { ok: false, reason: REASON.check };
  }
  return null;
}

function storable(code: string): NormalizedBarcode {
  if (code.length < BARCODE_MIN_LENGTH) return { ok: false, reason: REASON.tooShort };
  if (code.length > BARCODE_MAX_LENGTH) return { ok: false, reason: REASON.tooLong };
  if (!STORABLE.test(code)) return { ok: false, reason: REASON.badChars };
  return { ok: true, code };
}

/**
 * Turn a scanned or typed code into the form stored on a library item.
 *
 * `format` is the scanner's format name (`ean_13`, `code_128`, …). Leave it
 * out for a number the tradie typed: 13, 12 and 8 digit numbers are then
 * checked as EAN-13, UPC-A and UPC-E/EAN-8 (an 8-digit number starting 0 or 1
 * that checks out as UPC-E is taken as UPC-E), and spaces or dashes between
 * the digits are dropped. Normalising the result again with the same format
 * returns it unchanged.
 */
export function normalizeBarcode(raw: unknown, format?: string | null): NormalizedBarcode {
  if (typeof raw !== "string") return { ok: false, reason: REASON.empty };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: REASON.empty };

  const fmt = typeof format === "string" && format.trim() ? format.trim().toLowerCase() : null;
  const typed = fmt === null || fmt === "unknown";

  if (fmt !== null && RETAIL_FORMATS.has(fmt)) {
    const digits = trimmed.replace(/[\s-]/g, "");
    if (!/^\d+$/.test(digits)) return { ok: false, reason: REASON.misread };
    return checkedRetail(digits, fmt) ?? { ok: false, reason: REASON.misread };
  }

  if (typed && /^\d[\d\s-]*$/.test(trimmed)) {
    const digits = trimmed.replace(/[\s-]/g, "");
    return checkedRetail(digits, null) ?? storable(digits);
  }

  return storable(trimmed);
}

export type ScanRead = { rawValue: string; format?: string | null };

export type ScanPick =
  | { kind: "accept"; code: string; format: string | null }
  /** Seen once; act on it when the next read matches `key`. */
  | { kind: "confirm"; key: string }
  | { kind: "reject"; reason: string }
  | { kind: "none" };

/**
 * Decide what to do with one camera frame's reads. The first usable code
 * wins. A code with no check digit (Code 39, Codabar, ITF) is only accepted
 * when two reads in a row agree — pass the previous `confirm` key back in —
 * unless `singleRead` is set (a still photo can't be read twice).
 */
export function pickScannedCode(
  reads: readonly ScanRead[],
  pendingKey: string | null,
  options: { singleRead?: boolean } = {},
): ScanPick {
  let rejected: string | null = null;
  for (const read of reads) {
    const format =
      typeof read.format === "string" && read.format ? read.format.toLowerCase() : null;
    const parsed = normalizeBarcode(read.rawValue, format);
    if (!parsed.ok) {
      rejected ??= parsed.reason;
      continue;
    }
    if (!options.singleRead && format !== null && NEEDS_SECOND_READ.has(format)) {
      const key = `${format}:${parsed.code}`;
      if (pendingKey !== key) return { kind: "confirm", key };
    }
    return { kind: "accept", code: parsed.code, format };
  }
  return rejected ? { kind: "reject", reason: rejected } : { kind: "none" };
}
