// ─────────────────────────────────────────────────────────────────────────
// Excel (.xlsx) price lists, read in the browser with no extra library.
//
// An .xlsx file is a zip of XML parts. We read the zip's central directory
// ourselves, inflate the parts we need with the built-in
// DecompressionStream("deflate-raw") (stored parts are copied as-is), find
// the first worksheet through xl/workbook.xml and its relationships, and
// turn its cells into rows — shared strings, inline strings, numbers, empty
// cells skipped by their column letters. Rows keep Excel's row numbers, so
// "row 14 was skipped" means row 14 in Excel. The rows then go through the
// same pipeline as a CSV (./priceList.ts).
//
// Browsers without DecompressionStream (older iPhones) get a clear "save it
// as CSV" message instead.
// ─────────────────────────────────────────────────────────────────────────

import type { TableRow } from "./priceList";

export type XlsxProblem = "unsupported_browser" | "not_xlsx" | "old_or_protected" | "too_big" | "no_sheet";

const MESSAGES: Record<XlsxProblem, string> = {
  unsupported_browser:
    "This phone can't open Excel files here. In Excel or Numbers, save the sheet as CSV and choose that file instead.",
  not_xlsx: "That doesn't look like an Excel (.xlsx) file. Save it as .xlsx or CSV and try again.",
  old_or_protected:
    "That's an older Excel file or it has a password. Open it in Excel, save it as .xlsx (no password) or CSV, and try again.",
  too_big: "That spreadsheet is too big to read here. Save the price list sheet on its own as CSV and try again.",
  no_sheet: "We couldn't find a sheet with any rows in that file. Check it opens in Excel, then try again.",
};

export class XlsxReadError extends Error {
  readonly problem: XlsxProblem;
  constructor(problem: XlsxProblem) {
    super(MESSAGES[problem]);
    this.name = "XlsxReadError";
    this.problem = problem;
  }
}

/** Uncompressed ceiling per part: a zip bomb stops here, not in the phone's memory. */
const MAX_PART_BYTES = 60 * 1024 * 1024;

type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** True when the built-in inflater is there (Safari 16.4+, Chrome 80+, Node 21+). */
export function canReadXlsx(): boolean {
  if (typeof DecompressionStream === "undefined") return false;
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

/** The zip's central directory: every part by name. */
export function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  // An old .xls or a password-protected .xlsx is an OLE file, not a zip.
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new XlsxReadError("old_or_protected");
  }
  if (bytes.length < 22 || u32(bytes, 0) !== 0x04034b50) throw new XlsxReadError("not_xlsx");
  let eocd = -1;
  const stop = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxReadError("not_xlsx");
  const count = u16(bytes, eocd + 10);
  const offset = u32(bytes, eocd + 16);
  // ZIP64 markers: far bigger than any price list.
  if (count === 0xffff || offset === 0xffffffff) throw new XlsxReadError("too_big");
  const names = new TextDecoder("utf-8");
  const entries = new Map<string, ZipEntry>();
  let p = offset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw new XlsxReadError("not_xlsx");
    const nameLength = u16(bytes, p + 28);
    const entry: ZipEntry = {
      name: names.decode(bytes.subarray(p + 46, p + 46 + nameLength)),
      flags: u16(bytes, p + 8),
      method: u16(bytes, p + 10),
      compressedSize: u32(bytes, p + 20),
      uncompressedSize: u32(bytes, p + 24),
      localOffset: u32(bytes, p + 42),
    };
    entries.set(entry.name, entry);
    p += 46 + nameLength + u16(bytes, p + 30) + u16(bytes, p + 32);
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (!canReadXlsx()) throw new XlsxReadError("unsupported_browser");
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PART_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new XlsxReadError("too_big");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** One part's bytes, inflated (deflate) or copied (stored). */
async function readPart(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.flags & 0x1) throw new XlsxReadError("old_or_protected");
  if (entry.uncompressedSize > MAX_PART_BYTES) throw new XlsxReadError("too_big");
  const at = entry.localOffset;
  if (at + 30 > bytes.length || u32(bytes, at) !== 0x04034b50) throw new XlsxReadError("not_xlsx");
  const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new XlsxReadError("not_xlsx");
}

async function readText(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  return new TextDecoder("utf-8").decode(await readPart(bytes, entry));
}

// ── XML, just enough of it ───────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** XML entities, then Excel's own _x000D_ escapes. */
export function decodeXmlText(s: string): string {
  return s
    .replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
      if (e[0] !== "#") return ENTITIES[e] ?? "";
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? decodeXmlText(m[1] ?? m[2] ?? "") : null;
}

/** The text of every <t> in a run of XML (phonetic <rPh> hints left out). */
function textRuns(xml: string): string {
  const withoutPhonetic = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let out = "";
  const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutPhonetic))) out += decodeXmlText(m[1]);
  return out;
}

/** "B" → 1, "AA" → 26. */
function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** A number as Excel shows it: float noise gone, never "1e-7". */
export function formatXlsxNumber(raw: string): string {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return raw.trim();
  const clean = Number(n.toPrecision(15));
  const text = String(clean);
  if (!/e/i.test(text)) return text;
  return clean.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/** "worksheets/sheet1.xml" relative to "xl/" → "xl/worksheets/sheet1.xml". */
function resolvePath(base: string, target: string): string {
  const parts = (target.startsWith("/") ? target.slice(1) : `${base}${target}`).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

function relationships(xml: string | null): Map<string, { target: string; type: string }> {
  const map = new Map<string, { target: string; type: string }>();
  if (!xml) return map;
  for (const tag of xml.match(/<(?:\w+:)?Relationship\b[^>]*>/g) ?? []) {
    const id = attr(tag, "Id");
    const target = attr(tag, "Target");
    if (id && target) map.set(id, { target, type: attr(tag, "Type") ?? "" });
  }
  return map;
}

/** Where the first worksheet lives: _rels/.rels → workbook → its first (visible) sheet. */
async function firstSheetPath(bytes: Uint8Array, entries: Map<string, ZipEntry>): Promise<string | null> {
  const rootRels = relationships(await readText(bytes, entries, "_rels/.rels"));
  const office = [...rootRels.values()].find((r) => /\/officeDocument$/.test(r.type));
  const workbookPath = office ? resolvePath("", office.target) : "xl/workbook.xml";
  const workbook = await readText(bytes, entries, workbookPath);
  const dir = workbookPath.includes("/") ? workbookPath.slice(0, workbookPath.lastIndexOf("/") + 1) : "";
  if (workbook) {
    const rels = relationships(
      await readText(bytes, entries, `${dir}_rels/${workbookPath.slice(dir.length)}.rels`),
    );
    const sheets = workbook.match(/<(?:\w+:)?sheet\b[^>]*>/g) ?? [];
    const visible = sheets.filter((tag) => !/\sstate\s*=\s*["'](?:hidden|veryHidden)["']/.test(tag));
    for (const tag of [...visible, ...sheets]) {
      const idMatch = tag.match(/\s(?:\w+:)?id\s*=\s*"([^"]*)"/);
      const rel = idMatch ? rels.get(idMatch[1]) : undefined;
      if (rel) {
        const path = resolvePath(dir, rel.target);
        if (entries.has(path)) return path;
      }
    }
  }
  const fallback = [...entries.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort();
  return fallback[0] ?? null;
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ? textRuns(m[1]) : "");
  return out;
}

/** The rows of a worksheet's XML, with Excel's row numbers. Exported for tests. */
export function worksheetRows(xml: string, strings: string[]): TableRow[] {
  const rows: TableRow[] = [];
  const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  let previousRow = 0;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowAttr = attr(` ${rm[1]}`, "r");
    const rowNumber = rowAttr && /^\d+$/.test(rowAttr) ? Number(rowAttr) : previousRow + 1;
    previousRow = rowNumber;
    const cells: string[] = [];
    let previousCol = -1;
    let cm: RegExpExecArray | null;
    const body = rm[2] ?? "";
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(body))) {
      const tag = ` ${cm[1]}`;
      const ref = attr(tag, "r");
      const letters = ref?.match(/^([A-Za-z]+)\d*$/)?.[1];
      const col = letters ? columnIndex(letters) : previousCol + 1;
      previousCol = col;
      const inner = cm[2] ?? "";
      const type = attr(tag, "t") ?? "n";
      const v = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let value = "";
      if (type === "s") value = strings[Number(v)] ?? "";
      else if (type === "inlineStr") value = textRuns(inner);
      else if (type === "b") value = v === "1" ? "TRUE" : v === "0" ? "FALSE" : "";
      else if (type === "e") value = "";
      else if (type === "str" || type === "d") value = v !== undefined ? decodeXmlText(v) : "";
      else value = v !== undefined ? formatXlsxNumber(decodeXmlText(v)) : "";
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    rows.push({ row: rowNumber, cells });
  }
  return rows;
}

/**
 * The first worksheet of an .xlsx file as rows (Excel row numbers kept).
 * Throws XlsxReadError with a plain message the screen can show.
 */
export async function readXlsxRows(input: ArrayBuffer | Uint8Array): Promise<TableRow[]> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = readZipDirectory(bytes);
  if (!canReadXlsx()) throw new XlsxReadError("unsupported_browser");
  const path = await firstSheetPath(bytes, entries);
  if (!path) throw new XlsxReadError("no_sheet");
  const [sheet, strings] = await Promise.all([
    readText(bytes, entries, path),
    readText(bytes, entries, "xl/sharedStrings.xml"),
  ]);
  if (!sheet) throw new XlsxReadError("no_sheet");
  const rows = worksheetRows(sheet, sharedStrings(strings));
  if (!rows.some((r) => r.cells.some((c) => c.trim() !== ""))) throw new XlsxReadError("no_sheet");
  return rows;
}
