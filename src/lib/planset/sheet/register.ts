// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the register of the whole set (pure).
//
// A consented PDF is a bundle: a drawing index, 20–60 sheets, and the
// council's paperwork. The register answers, before any measuring starts:
//
//   - which page is which sheet (sheet number, title, kind, building, level)
//   - what the drawing index promises, and what the set actually holds:
//       missing  — listed on the index, on no page
//       unlisted — a drawing that isn't on the index (an engineer's sheet
//                  slipped in, or the index is out of date)
//   - whether the sheets agree on one revision, and which are drafts
//   - which pages are paperwork (Form 5, inspections, producer statements)
//     rather than drawings, so nothing tries to measure them
//
// The drawing index is read by position — the sheet number and the name
// share a row, whatever order the drafter's export put the text in — and
// every match between the index and a page is by the printed sheet number.
// ─────────────────────────────────────────────────────────────────────────

import type { SheetRaw, TextItem } from "../types";
import { classifySheet, mentionsBuilding, type SheetKind } from "./classify";
import { parseRevision, parseSheetId, type SheetTitle } from "./titleBlock";

export type IndexEntry = { sheetId: string; name: string; revision: string | null };

export type RegisterEntry = {
  page: number;
  /** Printed on the sheet — or, for a sheet printed without its number, the one index row that can only be it. */
  sheetId: string | null;
  title: string | null;
  /** The name the drawing index gives this sheet. */
  indexName: string | null;
  kind: SheetKind;
  building: string | null;
  level: string | null;
  revision: string | null;
  /** Consent paperwork or a report rather than a drawing. */
  document: boolean;
  draft: boolean;
  approved: boolean;
};

export type Register = {
  entries: RegisterEntry[];
  /** The drawing index(es) as printed. */
  index: IndexEntry[];
  /** Listed on the index, on no page. */
  missing: IndexEntry[];
  /** Drawing pages whose sheet number isn't on the index (only when an index was found). */
  unlisted: number[];
  /** Distinct revisions on the drawing sheets (01 and 1 count as one). */
  revisions: string[];
  mixedRevisions: boolean;
  /** Pages marked DRAFT / NOT FOR CONSTRUCTION / PRELIMINARY. */
  drafts: number[];
  /** Distinct building / unit names found on the sheets. */
  buildings: string[];
  /** The consent number and authority the paperwork states, when it does. */
  consent?: { number: string | null; authority: string | null; pages: number[] };
};

// ── drawing index ───────────────────────────────────────────────────────

type Cell = { s: string; x0: number; x1: number; base: number; top: number; bot: number; h: number };

const cellOf = (it: TextItem): Cell => ({
  s: it.s.replace(/\s+/g, " ").trim(),
  x0: it.x,
  x1: it.x + it.w,
  base: it.y,
  top: it.y - 0.78 * it.h,
  bot: it.y + 0.22 * it.h,
  h: it.h,
});

const centre = (c: Cell) => (c.x0 + c.x1) / 2;

function sameRow(a: Cell, b: Cell): boolean {
  const o = Math.min(a.bot, b.bot) - Math.max(a.top, b.top);
  if (o > 0 && o / Math.min(a.bot - a.top, b.bot - b.top) >= 0.4) return true;
  const [small, big] = a.bot - a.top <= b.bot - b.top ? [a, b] : [b, a];
  const mid = (small.top + small.bot) / 2;
  const slack = 0.2 * (big.bot - big.top);
  return mid >= big.top - slack && mid <= big.bot + slack;
}

/** A row of the list that starts with a sheet number, alone or with the name after it in the same run. */
type IdHit = { cell: Cell; id: string; rest: string | null };

const PREFIXED = /^(?:SHT|SHEET|DWG|DRG)\.?\s*(?:NO\.?\s*)?([A-Z]{0,4}[-._]?\d{1,4}(?:[.\-/]\d{1,3})?[A-Z]?)\s+(\S.*)$/i;
const UNPREFIXED = /^([A-Z]{1,3}[-.]?\d{2,4}(?:\.\d{1,3})?)\s+([A-Za-z].*)$/;

function idHit(c: Cell): IdHit | null {
  const pure = parseSheetId(c.s, false);
  if (pure) return { cell: c, id: pure, rest: null };
  const m = c.s.match(PREFIXED);
  if (m) {
    const core = /^\d/.test(m[1]) ? `SHT ${m[1]}` : m[1].toUpperCase().replace(/\s+/g, "");
    const id = parseSheetId(core, false);
    if (id) return { cell: c, id, rest: m[2].trim() };
  }
  const u = c.s.match(UNPREFIXED);
  if (u && (u[2].match(/[A-Za-z]/g) ?? []).length >= 3 && u[2].length <= 90) {
    const id = parseSheetId(u[1], false);
    if (id) return { cell: c, id, rest: u[2].trim() };
  }
  return null;
}

const ID_CAPTION = /^(?:ID|DRG\.?\s*NO\.?|DWG\.?\s*NO\.?|SHEET\s*(?:NO\.?|NUMBER|#)|DRAWING\s*(?:NO\.?|NUMBER)|NO\.?|REF\.?|SHT|SHEET)$/i;
const NAME_CAPTION = /^(?:LAYOUT(?:\s*NAME)?|SHEET\s*NAME|SHEET\s*TITLE|DRAWING\s*(?:TITLE|NAME|DESCRIPTION)|TITLE|DESCRIPTION|NAME|DRAWING)$/i;
const LIST_HEADING =
  /\b(?:DRAWING|SHEET|DRAWINGS)\s*(?:LIST|INDEX|REGISTER|SCHEDULE)\b|\bINDEX OF DRAWINGS\b|\bLIST OF DRAWINGS\b|\bSCHEDULE OF DRAWINGS\b|\bDRAWINGS?\s*LIST\b/i;

type Run = { hits: IdHit[] };

/**
 * The list of drawings on a page, paired by ROW: a sheet number and the name
 * on its row, whichever way the text was exported. Null when the page holds
 * no such list. A list needs a caption row ("ID | Layout Name", "DRG No. |
 * SHEET NAME") or a heading ("DRAWING LIST") above it — a column of "W01,
 * W02…" in a window schedule is not a drawing index.
 */
export function readDrawingIndex(sheet: SheetRaw): IndexEntry[] | null {
  const cells = sheet.text
    .filter((it) => it.s.trim() && (it.angle <= 3 || it.angle >= 357))
    .map(cellOf);
  if (cells.length < 6) return null;

  const hits = cells.map(idHit).filter((h): h is IdHit => h !== null);
  if (hits.length < 4) return null;

  // Column: rows whose sheet numbers line up (same left edge, or same centre for centred columns).
  const groups: IdHit[][] = [];
  for (const h of [...hits].sort((a, b) => a.cell.x0 - b.cell.x0)) {
    const g = groups.find((gg) => Math.abs(gg[0].cell.x0 - h.cell.x0) <= 1.5 || Math.abs(centre(gg[0].cell) - centre(h.cell)) <= 1.5);
    if (g) g.push(h);
    else groups.push([h]);
  }

  const idCaptions = cells.filter((c) => ID_CAPTION.test(c.s.replace(/[:.]$/, "")));
  const runs: Run[] = [];
  for (const g of groups) {
    const rows = [...g].sort((a, b) => a.cell.base - b.cell.base);
    if (rows.length < 4) continue;
    const gaps = rows.slice(1).map((r, i) => r.cell.base - rows[i].cell.base).filter((d) => d > 0.5);
    if (gaps.length === 0) continue;
    const pitch = Math.min(...gaps);
    let cur: IdHit[] = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      const gap = b.cell.base - a.cell.base;
      // A caption row ("ID | Layout") between two rows starts a new table.
      const newTable = idCaptions.some((c) => c.base > a.cell.base + 0.5 && c.base < b.cell.base - 0.5 && Math.abs(c.x0 - a.cell.x0) <= 12);
      if (gap > 4.5 * pitch || newTable || gap < 0.5) {
        runs.push({ hits: cur });
        cur = [b];
      } else {
        cur.push(b);
      }
    }
    runs.push({ hits: cur });
  }

  let best: { entries: IndexEntry[]; rows: number } | null = null;
  for (const run of runs) {
    if (run.hits.length < 3) continue;
    const first = run.hits[0].cell;
    // Evidence: a caption row ("ID | Layout Name") right above the first row, or a heading ("DRAWING LIST") above it.
    const above = cells.filter((c) => c.base < first.top + 0.5 && first.base - c.base <= 45);
    const idCap = above.find(
      (c) =>
        first.base - c.base <= 16 &&
        ID_CAPTION.test(c.s.replace(/[:.]$/, "")) &&
        (Math.abs(c.x0 - first.x0) <= 20 || Math.abs(centre(c) - centre(first)) <= 20),
    );
    const nameCap =
      idCap !== undefined &&
      above.some((c) => c !== idCap && NAME_CAPTION.test(c.s.replace(/[:.]$/, "")) && sameRow(idCap, c) && c.x0 > idCap.x0 && c.x0 - idCap.x1 <= 140);
    const headed = above.some((c) => LIST_HEADING.test(c.s) && Math.abs(c.x0 - first.x0) <= 150);
    if (!nameCap && !headed) continue;
    const entries = readRows(run, cells, above);
    if (entries.length >= 3 && new Set(entries.map((e) => e.sheetId)).size >= 3 && (!best || entries.length > best.rows)) {
      best = { entries, rows: entries.length };
    }
  }
  return best ? best.entries : null;
}

/** Turn the rows of one list into entries: name beside the number, revision under the REV caption. */
function readRows(run: Run, cells: Cell[], above: Cell[]): IndexEntry[] {
  const first = run.hits[0].cell;
  // The REV caption sits above the first row, to the right of the number.
  const revCap = above
    .filter((c) => /^REV(?:ISION)?\.?$/i.test(c.s.replace(/:$/, "")) && c.x0 > first.x0 && c.top >= first.base - 30)
    .sort((a, b) => Math.abs(b.base - first.base) - Math.abs(a.base - first.base))[0];
  const revX = revCap ? centre(revCap) : null;
  const stops = above.filter((c) => /^(?:DATE|(?:DESIGN |DWG )?STATUS|ISSUED?|REVISION|REV)\.?$/i.test(c.s.replace(/:$/, "")) && c.x0 > first.x0).map((c) => c.x0);
  const nameStop = stops.length ? Math.min(...stops) - 4 : Infinity;

  const ids = new Set(run.hits.map((h) => h.cell));
  const rowsY = run.hits.map((h) => h.cell.base);
  const out: IndexEntry[] = [];
  const nameXs: number[] = [];
  for (let i = 0; i < run.hits.length; i++) {
    const h = run.hits[i];
    const c = h.cell;
    const row = cells.filter((t) => t !== c && !ids.has(t) && sameRow(c, t) && t.x0 >= c.x1 - 0.5).sort((a, b) => a.x0 - b.x0);
    let name = h.rest ?? "";
    let revision: string | null = null;
    let edge = c.x1;
    let nameDone = false;
    for (const t of row) {
      // The revision token: under the REV caption, or a printed "Rev A".
      const rv = t.s.match(/^REV(?:ISION)?\.?\s+([A-Z0-9]{1,3})$/i);
      if (rv) {
        revision = parseRevision(rv[1]);
        nameDone = true;
        continue;
      }
      if (revX !== null && Math.abs(centre(t) - revX) <= 6 && t.s.length <= 4) {
        revision = parseRevision(t.s);
        nameDone = true;
        continue;
      }
      if (nameDone || t.x0 >= nameStop) {
        nameDone = true;
        continue;
      }
      const gap = t.x0 - edge;
      if (name && gap > Math.max(8, 2.5 * t.h)) {
        nameDone = true;
        continue;
      }
      if (!name && h.rest === null) nameXs.push(t.x0);
      name = name ? `${name} ${t.s}` : t.s;
      edge = Math.max(edge, t.x1);
    }
    // A name that wraps onto the next line, under the name column (never onto another row's number).
    const nextY = i + 1 < run.hits.length ? rowsY[i + 1] : c.base + 12;
    const nameX = nameXs.length ? nameXs.sort((a, b) => a - b)[Math.floor(nameXs.length / 2)] : null;
    if (name && nameX !== null) {
      const wraps = cells
        .filter((t) => !ids.has(t) && t.base > c.base + 1 && t.base < nextY - 1 && Math.abs(t.x0 - nameX) <= 2 && !sameRow(c, t))
        .sort((a, b) => a.base - b.base);
      const w = wraps[0];
      if (w && w.base - c.base <= 2.2 * c.h + 1 && (w.s.match(/[A-Za-z]/g) ?? []).length >= 2 && idHit(w) === null) name = `${name} ${w.s}`;
    }
    name = name.replace(/\s+/g, " ").trim();
    if (name) out.push({ sheetId: h.id, name, revision });
  }
  return out;
}

// ── document pages ──────────────────────────────────────────────────────

const DOCUMENT_WORDS =
  /building consent|form 5|producer statement|code compliance|compliance schedule|inspections? required|required items|advice notes|section 51|memorandum|s90 building act/i;

/**
 * Consent paperwork or a report: a page with no sheet number that is A4 or
 * smaller and carries no line work (a form's tables are filled boxes; a
 * drawing is thousands of strokes). Big pages with no number — a cover, a
 * site photo — stay drawings.
 */
function isDocumentPage(sheet: SheetRaw, title: SheetTitle): boolean {
  if (title.sheetId) return false;
  if (sheet.text.length === 0) return false;
  const a4 = Math.max(sheet.widthMm, sheet.heightMm) <= 312 && Math.min(sheet.widthMm, sheet.heightMm) <= 218;
  if (!a4) return false;
  if (sheet.segs.length < 30) return true;
  // A form whose tables are drawn as strokes: only with the paperwork's own words, and nowhere near a drawing's line count.
  return sheet.segs.length < 400 && DOCUMENT_WORDS.test(sheet.text.map((t) => t.s).join(" "));
}

/** "S101" is an engineer's sheet, "A101" an architect's; anything else says nothing. */
function structuralHint(id: string | null): boolean | undefined {
  if (!id) return undefined;
  if (/^S[-._]?\d/i.test(id)) return true;
  if (/^[A-RT-Z][-._]?\d/i.test(id)) return false;
  return undefined;
}

// ── the register ────────────────────────────────────────────────────────

const looseKey = (id: string) => id.toUpperCase().replace(/^(?:SHT|SHEET|DWG|DRG)/, "").replace(/[\s._-]+/g, "");
const revKey = (r: string) => (/^\d+$/.test(r) ? String(Number(r)) : r.toUpperCase());

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

export function buildRegister(pages: Array<{ page: number; sheet: SheetRaw; title: SheetTitle }>): Register {
  // ── 1. the drawing index (any page that lists the drawings)
  const index: IndexEntry[] = [];
  const indexPages = new Set<number>();
  const seen = new Set<string>();
  for (const p of pages) {
    const rows = readDrawingIndex(p.sheet);
    if (!rows) continue;
    indexPages.add(p.page);
    // A list repeated on a second page is the same list, not more sheets.
    const fresh = rows.filter((r) => !seen.has(`${r.sheetId}|${r.name}`));
    if (fresh.length === 0) continue;
    for (const r of rows) {
      seen.add(`${r.sheetId}|${r.name}`);
      index.push(r);
    }
  }

  // ── 2. match printed sheet numbers to index rows (each row to one page, in order)
  const analysed = pages.map((p) => ({ ...p, document: isDocumentPage(p.sheet, p.title) }));
  const claimedRow = new Set<number>();
  /** Index row of each page, by position in `pages`. */
  const rowOf = new Map<number, number>();
  let lastRow = -1;
  analysed.forEach((p, at) => {
    const id = p.title.sheetId;
    if (!id || p.document) return;
    const exact = (r: IndexEntry) => r.sheetId.toUpperCase().replace(/\s+/g, "") === id.toUpperCase().replace(/\s+/g, "");
    const loose = (r: IndexEntry) => looseKey(r.sheetId) === looseKey(id);
    const candidates = (test: (r: IndexEntry) => boolean) => index.map((r, i) => (test(r) && !claimedRow.has(i) ? i : -1)).filter((i) => i >= 0);
    let pool = candidates(exact);
    if (pool.length === 0) pool = candidates(loose);
    if (pool.length === 0) return;
    // Keep the index order where duplicates exist: the first unclaimed row after the last match, else the first.
    const row = pool.find((i) => i > lastRow) ?? pool[0];
    claimedRow.add(row);
    rowOf.set(at, row);
    lastRow = row;
  });

  // ── 3. a drawing with no printed number, sitting between two matched sheets, takes the only index row left there
  const sheetIdOverride = new Map<number, string>();
  const order = analysed.map((p, at) => ({ at, p })).filter((o) => !o.p.document);
  const numberless = (k: number) => !order[k].p.title.sheetId && !rowOf.has(order[k].at);
  for (let i = 0; i < order.length; i++) {
    if (!numberless(i) || (i > 0 && numberless(i - 1))) continue;
    // The run of number-less drawings starting here.
    let b = i;
    while (b + 1 < order.length && numberless(b + 1)) b++;
    const before = i > 0 ? (rowOf.get(order[i - 1].at) ?? -1) : -1;
    const after = b + 1 < order.length ? (rowOf.get(order[b + 1].at) ?? index.length) : index.length;
    const free = index.map((_, r) => r).filter((r) => r > before && r < after && !claimedRow.has(r));
    const n = b - i + 1;
    if (free.length === n && (i > 0 || b + 1 < order.length)) {
      for (let k = 0; k < n; k++) {
        claimedRow.add(free[k]);
        rowOf.set(order[i + k].at, free[k]);
        sheetIdOverride.set(order[i + k].at, index[free[k]].sheetId);
      }
    }
  }

  // ── 4. classify every page
  const entries: RegisterEntry[] = analysed.map((p, at) => {
    const row = rowOf.get(at);
    const idx = row !== undefined ? index[row] : null;
    const sheetId = p.title.sheetId ?? sheetIdOverride.get(at) ?? null;
    const cls = classifySheet({
      title: p.title.title,
      indexName: idx ? idx.name : null,
      sheet: p.sheet,
      document: p.document,
      structural: structuralHint(sheetId),
    });
    let kind = cls.kind;
    // A drawing list on page 1 with no sheet number of its own is a cover that carries the list.
    if (kind === "index" && p.page === 1 && !p.title.sheetId && indexPages.has(p.page)) kind = "cover";
    return {
      page: p.page,
      sheetId,
      title: p.title.title,
      indexName: idx ? idx.name : null,
      kind,
      building: cls.building,
      level: cls.level,
      revision: p.title.revision ?? (idx ? idx.revision : null),
      document: p.document,
      draft: p.title.draft,
      approved: p.title.consent.approved,
    };
  });

  // ── 5. a building named on the plans is the building of every sheet that says its name
  const known = [...new Set(entries.map((e) => e.building).filter((b): b is string => b !== null))];
  for (const e of entries) {
    if (e.building !== null || e.document) continue;
    const named = known.find((b) => mentionsBuilding(e.title, b) || mentionsBuilding(e.indexName, b));
    if (named) e.building = named;
  }
  const buildings: string[] = [];
  for (const e of entries) {
    if (e.building && !buildings.some((b) => b.toLowerCase() === e.building!.toLowerCase())) buildings.push(e.building);
  }

  // ── 6. what the index promises against what the set holds
  const missing = index.filter((_, i) => !claimedRow.has(i));
  const listed = new Set(index.map((r) => looseKey(r.sheetId)));
  const unlisted =
    index.length === 0
      ? []
      : entries
          .filter((e) => !e.document && e.sheetId !== null && !listed.has(looseKey(e.sheetId)))
          .map((e) => e.page);

  const seenRev = new Map<string, string>();
  for (const e of entries) {
    if (e.document || e.revision === null) continue;
    if (!seenRev.has(revKey(e.revision))) seenRev.set(revKey(e.revision), e.revision);
  }
  const revisions = [...seenRev.values()].sort(naturalCompare);

  // The paperwork's consent number and authority, when it states them.
  const consentPages: number[] = [];
  let consentNumber: string | null = null;
  let consentAuthority: string | null = null;
  for (const p of analysed) {
    const c = p.title.consent;
    if (c.number === null && c.authority === null) continue;
    consentPages.push(p.page);
    consentNumber ??= c.number;
    consentAuthority ??= c.authority;
  }

  const register: Register = {
    entries,
    index,
    missing,
    unlisted,
    revisions,
    mixedRevisions: revisions.length > 1,
    drafts: entries.filter((e) => e.draft).map((e) => e.page),
    buildings,
  };
  if (consentPages.length) register.consent = { number: consentNumber, authority: consentAuthority, pages: consentPages };
  return register;
}
