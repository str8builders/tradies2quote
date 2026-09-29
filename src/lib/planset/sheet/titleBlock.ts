// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the sheet's title block (pure).
//
// Every drawing carries a block that says which sheet it is: number, title,
// scale, revision, date, project, and the council's approval. Drafters lay
// it out four different ways — labels with the value beside them ("SHEET
// NUMBER :  A02.3"), labels with the value under them ("DRAWING TITLE:" over
// the title), no labels at all (a big title above "sht 3 of 22"), or a
// little table of small captions with a huge sheet number in one corner.
// This reads all of them from the text runs, with no dependencies:
//
//   1. labelled fields: find the label, take the value beside it, else under
//      it (stopping at the next label so a value never crosses cells);
//   2. else the sheet number is "sht 3 of 22", or the largest sheet-number-
//      shaped run in the outer 28% of the sheet (right strip / bottom band)
//      when a caption sits near it or it stands alone in the bottom-right
//      corner at twice the page's text size;
//   3. an unlabelled title is the largest lettered text stacked beside the
//      block, an unlabelled date the date-shaped run beside it.
//
// Nothing is invented: a template placeholder ("Proj No.", "Date", "??") is
// not a value, and every field is null when it can't be read. Text ids of
// what was used come back as evidence.
// ─────────────────────────────────────────────────────────────────────────

import type { SheetRaw, TextItem } from "../types";

export type SheetTitle = {
  /** The sheet's own number: "A02.3", "S112", "A120", "A-101", "SHT 3". */
  sheetId: string | null;
  /** "Ground Floor - Dimension Plan", "COTTAGE GROUND FLOOR PLAN", "NEW FLOOR PLAN". */
  title: string | null;
  /** Every scale statement printed on the sheet, raw: "1:100 @ A3", "As indicated", "Scale: 1:50". */
  scaleNotes: string[];
  revision: string | null;
  date: string | null;
  /** Project / job number. */
  project: string | null;
  /** The council's approval, when it is printed as text (a stamp drawn as a picture can't be read). */
  consent: { approved: boolean; number: string | null; authority: string | null };
  /** "DRAFT" / "NOT FOR CONSTRUCTION" / "PRELIMINARY" marks. */
  draft: boolean;
  /** Evidence: text ids used for the sheet number, title, revision, date, project and scale. */
  textIds: number[];
};

// ── tokens ──────────────────────────────────────────────────────────────

type Tok = {
  id: number;
  /** As printed, spaces collapsed. */
  s: string;
  /** Upper-case, for matching. */
  u: string;
  x0: number;
  x1: number;
  base: number;
  top: number;
  bot: number;
  h: number;
  angle: number;
};

const GLYPH_TOP = 0.78;
const GLYPH_BOTTOM = 0.22;

function makeTok(it: TextItem, x: number, baseline: number): Tok {
  const s = it.s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return {
    id: it.id,
    s,
    u: s.toUpperCase(),
    x0: x,
    x1: x + it.w,
    base: baseline,
    top: baseline - GLYPH_TOP * it.h,
    bot: baseline + GLYPH_BOTTOM * it.h,
    h: it.h,
    angle: it.angle,
  };
}

/** Text that reads along the frame's x axis (turn = the reading angle it must have), mapped into that frame. */
function frameTokens(items: readonly TextItem[], W: number, H: number, turn: 0 | 90 | 270): { toks: Tok[]; W2: number; H2: number } {
  const toks: Tok[] = [];
  for (const it of items) {
    if (!it.s.trim()) continue;
    const a = ((it.angle % 360) + 360) % 360;
    const off = Math.min(Math.abs(a - turn), 360 - Math.abs(a - turn));
    if (off > 3) continue;
    if (turn === 0) toks.push(makeTok(it, it.x, it.y));
    // Reads bottom→top: rotate the page so it reads left→right.
    else if (turn === 90) toks.push(makeTok(it, H - it.y, it.x));
    else toks.push(makeTok(it, it.y, W - it.x));
  }
  return turn === 0 ? { toks, W2: W, H2: H } : { toks, W2: H, H2: W };
}

// ── labels ──────────────────────────────────────────────────────────────

type FieldKind = "sheetId" | "title" | "scale" | "revision" | "date" | "project" | "status";

type LabelRule = {
  kind: FieldKind;
  re: RegExp;
  /** A bare word that might be a label: only trusted with a colon or a much bigger value beside it. */
  weak?: true;
};

const LABEL_RULES: LabelRule[] = [
  { kind: "sheetId", re: /^(?:SHEET|SHT|DWG|DRG|DRAWING)\s*(?:NO\.?|NUMBER|NUM\.?|#|REF\.?|ID)$/ },
  { kind: "sheetId", re: /^(?:SHEET|SHT|DWG|DRG)$/, weak: true },
  { kind: "title", re: /^(?:DRAWING|SHEET|DWG|DRG|VIEW|LAYOUT)\s*(?:TITLE|NAME)$/ },
  { kind: "title", re: /^(?:TITLE|DRAWING)$/, weak: true },
  { kind: "scale", re: /^SCALES?(?:\s*(?:@|AT)\s*A[0-4])?(?:\s*\(A[0-4]\))?$/ },
  { kind: "revision", re: /^(?:REVISION|REV)(?:\s*(?:NO\.?|NUMBER|#))?\.?$/ },
  { kind: "date", re: /^(?:(?:ISSUE|ISSUED|DWG|DRAWING|SHEET)\s+)?DATE(?:\s+ISSUED)?$/ },
  { kind: "project", re: /^(?:PROJECT|JOB|PROJ)\s*(?:NO\.?|NUMBER|NUM\.?|#|REF\.?|REFERENCE|CODE|ID)$/ },
  { kind: "project", re: /^(?:REFERENCE|REF\.?|JOB)$/, weak: true },
  { kind: "status", re: /^(?:(?:DRAWING|DWG|DESIGN|ISSUE)\s+)?STATUS$/ },
];

/** Captions that are not fields we read but that bound the neighbouring cell. */
const OTHER_LABEL =
  /^(?:CLIENT|ADDRESS|SITE ADDRESS|PROJECT|PROJECT (?:NAME|TITLE)|DRAWN(?: BY)?|CHECKED(?: BY)?|CHKD|DESIGN(?:ED)?(?: BY)?|DESIGNER|APPROVED(?: BY)?|ISSUED BY|FILE(?: NAME)?|CAD FILE NAME|(?:ORIGINAL )?SHEET SIZE|(?:PLOT|PRINT|PRINTED|PLOTTED) DATE|COUNCIL(?: APPROVAL)?|APPROVAL|CONCEPT|ARCHITECT|ENGINEER|CONSULTANT|LOCATION|REVISION DESCRIPTION|DESCRIPTION|CLIENT SIGNATURE|SIGNATURE|\/ DATE|OWNERS?|CONTACT|PH|PHONE|E-?MAIL|WEBSITE|TEL|BC (?:NO|NUMBER)|CONSENT (?:NO|NUMBER)|PAGE|PAGE NO|DATE ISSUED|SUBMITTED)$/;

type LabelInfo = {
  kind: FieldKind | "other";
  weak: boolean;
  colon: boolean;
  /** Only a colon made it a caption ("WD:"): bounds a neighbouring cell but owns no value. */
  generic?: true;
};

function labelOf(t: Tok): LabelInfo | null {
  if (t.s.length > 34) return null;
  const colon = /[:：]\s*$/.test(t.u);
  const lab = t.u.replace(/\s*[:：]\s*$/, "").replace(/\s+/g, " ");
  for (const r of LABEL_RULES) if (r.re.test(lab)) return { kind: r.kind, weak: r.weak === true, colon };
  if (OTHER_LABEL.test(lab)) return { kind: "other", weak: false, colon };
  if (colon && lab.split(" ").length <= 4 && lab.length <= 28 && /[A-Z]{2}/.test(lab)) return { kind: "other", weak: false, colon, generic: true };
  return null;
}

/** Words captions are made of — a run built only from these is a caption, not a value. */
const CAPTION_WORD =
  /^(?:PROJECT|JOB|DWG|DRG|DRAWING|DRAWN|SHEET|CLIENT|ADDRESS|CHECKED|CHKD|DESIGN|DESIGNED|APPROVED|ISSUED|ISSUE|REV|REVISION|DATE|SCALE|STATUS|TITLE|SIZE|FILE|CAD|PLOT|PRINT|COUNCIL|APPROVAL|BY|NO|NUMBER|REF|REFERENCE|LAYOUT|NAME|DESCRIPTION|CONCEPT|ARCHITECT|ENGINEER|SIGNATURE|ORIGINAL|OF|@|A[0-4]|#|:|\/|-|\.)$/;

// ── values ──────────────────────────────────────────────────────────────

/** Letters + digits: A02.3, A000, S112, A-101, A120, SK01, A3.2b, E101. */
const ID_RE = /^([A-Z]{1,4})\s?[-._]?\s?(\d{1,4})(?:[.\-/](\d{1,3}))?([A-Z])?$/i;

function readSheetId(raw: string, labelled: boolean): string | null {
  let t = raw.replace(/\s+/g, " ").trim().replace(/[.:,;]+$/, "");
  if (!t || t.length > 16) return null;
  let prefixed = false;
  const p = t.match(/^(?:SHEET|SHT|DWG|DRG)\.?\s*(?:NO\.?\s*)?(.+)$/i);
  if (p) {
    t = p[1].trim();
    prefixed = true;
  }
  if (/^\d{1,3}[A-Za-z]?$/.test(t)) return labelled || prefixed ? (prefixed ? `SHT ${t.toUpperCase()}` : t.toUpperCase()) : null;
  if (!ID_RE.test(t)) return null;
  if (isPlaceholder(t)) return null;
  return t.toUpperCase().replace(/\s+/g, "");
}

/** A sheet number as drawings print it ("A02.3", "S112", "SHT 3"); null for anything else. */
export function parseSheetId(raw: string, labelled = false): string | null {
  return readSheetId(raw, labelled);
}

/** A revision mark ("A", "01", "P1"); null for anything else. */
export function parseRevision(raw: string): string | null {
  return readRevision(raw);
}

/** Marks like A, B, C2, P1, 01, 03 — a revision, never a word. */
function readRevision(raw: string): string | null {
  const t = raw
    .trim()
    .replace(/^REV(?:ISION)?\.?\s*/i, "")
    .replace(/[.:]+$/, "");
  if (!/^[A-Z0-9]{1,3}$/i.test(t)) return null;
  if (isPlaceholder(t)) return null;
  return t.toUpperCase();
}

const MONTH = "(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)";
const DATE_RE = new RegExp(
  `^(?:\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{2,4}|\\d{4}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{1,2}|\\d{1,2}(?:ST|ND|RD|TH)?\\s+${MONTH}\\.?,?\\s+\\d{2,4}|${MONTH}\\.?\\s+\\d{1,2}(?:ST|ND|RD|TH)?,?\\s+\\d{2,4}|${MONTH}\\.?\\s+\\d{4}|(?:0?[1-9]|1[0-2])\\s*[./-]\\s*(?:19|20)\\d{2})$`,
  "i",
);

function readDate(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
  return DATE_RE.test(t) ? t : null;
}

/** A sortable number for a day-first date, so the later of two overprinted dates can win. */
function dateValue(raw: string): number {
  const m = raw.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})/);
  if (!m) return 0;
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return y * 10_000 + Number(m[2]) * 100 + Number(m[1]);
}

function readProject(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  if (!/^[A-Z0-9][A-Z0-9\-_./ ]{1,18}[A-Z0-9]$/i.test(t) || !/\d/.test(t)) return null;
  if (isPlaceholder(t) || DATE_RE.test(t) || RATIO.test(t)) return null;
  return t;
}

/** A ratio "1:100", "1 : 50", "1:84.8036" — but not a time (1:30 pm) or a date (1:20/08). */
const RATIO = /(?:^|[^\d:.])1\s*[:：]\s*\d+(?:\.\d+)?(?!\d*[/:]\d)(?!\s*[ap]\.?\s?m\b)/i;
/** "NTS", "N.T.S.", "Not to scale", "As indicated" — the whole run, with an optional paper size after it. */
const NO_RATIO = /^(?:N\.?\s?T\.?\s?S\.?|NOT TO SCALE|AS (?:INDICATED|SHOWN|NOTED|STATED|SCHEDULED))\.?(?:\s*(?:@|AT)\s*A[0-4])?$/i;

function looksLikeScale(t: string): boolean {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length <= 40 && (RATIO.test(s) || NO_RATIO.test(s) || /\b\d+\/\d+"\s*=\s*1['′]/.test(s));
}

/** Template text and blanks: "Proj No.", "Date", "Your address", "??", "N/A". */
function isPlaceholder(t: string): boolean {
  return /^(?:PROJ(?:ECT)?\.?\s*(?:NO|NUMBER|#)\.?|DATE|YOUR .+|\?+|-+|N\/?A|TBC|TBA|TBD|X{2,}|NAME|TITLE|SHEET\s*(?:NO|NUMBER|TITLE)\.?|SCALE|REV(?:ISION)?|DRAWN|CHECKED|DRAWING\s*TITLE|CLIENT|ADDRESS|DD\/MM\/YY(?:YY)?|00?\/00?\/00(?:00)?|0+)$/i.test(
    t.trim(),
  );
}

function readTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().replace(/[:;]+$/, "").trim();
  if (t.length < 2 || t.length > 110) return null;
  if ((t.match(/[A-Za-z]/g) ?? []).length < 2) return null;
  if (isPlaceholder(t) || DATE_RE.test(t) || /^[A-Z]{1,4}\s?[-._]?\d{1,4}(?:[.\-/]\d{1,3})?[A-Z]?$/i.test(t)) return null;
  return t;
}

// ── geometry ────────────────────────────────────────────────────────────

/**
 * Two runs sit on the same visual row when their glyph bands overlap by 40%
 * of the shorter, or when the middle of the smaller one falls inside the
 * bigger one's band (a small caption beside a big number in the same cell).
 */
function sameRow(a: Tok, b: Tok): boolean {
  const o = Math.min(a.bot, b.bot) - Math.max(a.top, b.top);
  if (o > 0 && o / Math.min(a.bot - a.top, b.bot - b.top) >= 0.4) return true;
  const [small, big] = a.bot - a.top <= b.bot - b.top ? [a, b] : [b, a];
  const mid = (small.top + small.bot) / 2;
  const slack = 0.2 * (big.bot - big.top);
  return mid >= big.top - slack && mid <= big.bot + slack;
}

type Ctx = {
  toks: Tok[];
  isLabel: (t: Tok) => boolean;
};

/** Runs to the right of a label on its row, up to the next label. */
function rightGroup(L: Tok, cx: Ctx): Tok[] {
  const maxGap = Math.max(40, 12 * L.h);
  const row = cx.toks.filter((t) => t !== L && t.x0 >= L.x1 - 0.8 && sameRow(L, t)).sort((a, b) => a.x0 - b.x0);
  const out: Tok[] = [];
  let edge = L.x1;
  for (const t of row) {
    if (cx.isLabel(t)) break;
    const gap = t.x0 - edge;
    const limit = out.length === 0 ? maxGap : Math.max(3, 1.6 * Math.max(t.h, out[out.length - 1].h));
    if (gap > limit) break;
    out.push(t);
    edge = Math.max(edge, t.x1);
  }
  return out;
}

/** Runs under a label, above the next label; several lines when the value is a stacked title. */
function belowGroup(L: Tok, cx: Ctx, o: { multi: boolean; wide: boolean }): Tok[] {
  // The first line must sit close under the caption; a stacked title may run on for several more lines.
  const maxDy = Math.max(9, 4.5 * L.h);
  const xl = L.x0 - 2.5;
  const xr = o.wide ? L.x0 + 70 : L.x1 + Math.max(3, 0.35 * (L.x1 - L.x0));
  const below = cx.toks
    .filter(
      (t) =>
        t !== L && t.top >= L.bot - 0.6 && t.base > L.base && t.base - L.base <= (o.multi ? maxDy + 40 : maxDy) && t.x1 >= xl && t.x0 <= xr,
    )
    .sort((a, b) => a.base - b.base || a.x0 - b.x0);
  if (below.length === 0 || cx.isLabel(below[0]) || below[0].base - L.base > maxDy) return [];
  const first = below[0];
  const lines = [first];
  if (o.multi) {
    for (const t of below.slice(1)) {
      const prev = lines[lines.length - 1];
      if (sameRow(prev, t)) continue;
      if (cx.isLabel(t)) break;
      if (t.base - prev.base > 1.9 * prev.h + 1) break;
      if (Math.abs(t.h - first.h) > 0.25 * first.h) break;
      const aligned = Math.abs(t.x0 - first.x0) <= 4 || Math.abs((t.x0 + t.x1) / 2 - (first.x0 + first.x1) / 2) <= 8;
      if (!aligned) break;
      lines.push(t);
    }
  }
  return lines;
}

/** A caption over a long column of same-aligned rows is a table heading ("ID | Layout Name"), not a title-block cell. */
function isColumnHeader(L: Tok, cx: Ctx): boolean {
  const col = cx.toks.filter(
    (t) => t !== L && t.base > L.base + 1 && t.base - L.base <= 45 && t.x1 >= L.x0 - 2.5 && t.x0 <= L.x0 + 70 && !cx.isLabel(t),
  );
  for (const a of col) {
    const same = col.filter((b) => Math.abs(b.x0 - a.x0) <= 1.2);
    if (new Set(same.map((b) => Math.round(b.base / 2))).size >= 5) return true;
  }
  return false;
}

const joinToks = (g: Tok[]) => g.map((t) => t.s).join(" ");

// ── one reading frame ───────────────────────────────────────────────────

type Fields = {
  sheetId: string | null;
  title: string | null;
  revision: string | null;
  date: string | null;
  project: string | null;
  /** The title block's own scale field, raw. */
  scale: string | null;
  status: string | null;
  ids: number[];
  score: number;
};

type Used = { value: string; toks: Tok[] };

function readFrame(items: readonly TextItem[], W: number, H: number, turn: 0 | 90 | 270): Fields {
  const { toks, W2, H2 } = frameTokens(items, W, H, turn);
  const empty: Fields = { sheetId: null, title: null, revision: null, date: null, project: null, scale: null, status: null, ids: [], score: 0 };
  if (toks.length === 0) return empty;

  const inBand = (t: Tok) => t.x0 >= 0.72 * W2 || t.base >= 0.72 * H2;
  const info = new Map<Tok, LabelInfo>();
  for (const t of toks) {
    const l = labelOf(t);
    if (l) info.set(t, l);
  }
  // Captions of one block are set in one small size. A run that spells a caption word in a bigger size is a
  // template placeholder in a value cell ("Date", "Proj No."), not a caption.
  const capSizes = [...info].filter(([t, l]) => inBand(t) && !l.generic).map(([t]) => t.h).sort((a, b) => a - b);
  if (capSizes.length >= 3) {
    const capH = capSizes[Math.floor(capSizes.length / 2)];
    for (const [t] of [...info]) if (t.h > 1.25 * capH + 0.1) info.delete(t);
  }
  const isLabel = (t: Tok) => {
    if (info.has(t)) return true;
    const words = t.u.replace(/\s*[:：]\s*$/, "").split(" ");
    return t.s.length <= 40 && words.every((w) => CAPTION_WORD.test(w)) && words.some((w) => !/^(?:OF|@|A[0-4]|#|:|\/|-|\.)$/.test(w));
  };
  const cx: Ctx = { toks, isLabel };

  // Values that belong to some caption (of any kind) are not free text.
  const claimed = new Set<Tok>();
  for (const [t, l] of info) {
    if (!inBand(t) || l.generic) continue;
    // A caption owns the run beside it and the run under it (its value), not the whole line of text after it.
    for (const g of [rightGroup(t, cx), belowGroup(t, cx, { multi: false, wide: false })]) {
      if (g.length && l.kind !== "title") claimed.add(g[0]);
    }
  }

  const cornerDist = (t: Tok) => Math.hypot(W2 - t.x1, H2 - t.base);
  // Cells of one title block share an edge with the sheet-number caption; a pasted-in drawing's own block does not.
  let idLabel: Tok | null = null;
  const aligned = (t: Tok) => (idLabel && (Math.abs(t.x0 - idLabel.x0) <= 2 || Math.abs(t.x1 - idLabel.x1) <= 2) ? 0 : 1);
  // …and every caption of one block is set in the same small size.
  const sizeOff = (t: Tok) => (idLabel && Math.abs(t.h - idLabel.h) > 0.035 * idLabel.h + 0.02 ? 1 : 0);
  const headers = new Set<Tok>();
  for (const [t, l] of info) if ((l.kind === "title" || l.kind === "sheetId") && inBand(t) && isColumnHeader(t, cx)) headers.add(t);
  // Once the sheet-number caption is known: a caption in another size that sits far from it belongs to some
  // pasted-in drawing's own block. With no caption (a bare "sht 3 of 22"), only cells beside the number count.
  let anchorTok: Tok | null = null;
  const stranger = (t: Tok) => {
    if (idLabel) return sizeOff(t) === 1 && Math.hypot(t.x0 - idLabel.x0, t.base - idLabel.base) > 35;
    return anchorTok !== null && (Math.abs(t.x0 - anchorTok.x0) > 140 || Math.abs(t.base - anchorTok.base) > 60);
  };
  const tables = revisionTables(toks, info, isLabel).filter((tb) => inBand(tb.head));
  for (const tb of tables) {
    headers.add(tb.head);
    headers.add(tb.dateHead);
  }
  const labelled = (kind: FieldKind) =>
    [...info]
      .filter(([t, l]) => l.kind === kind && inBand(t) && !headers.has(t) && !stranger(t))
      .sort((a, b) => Number(a[1].weak) - Number(b[1].weak) || sizeOff(a[0]) - sizeOff(b[0]) || aligned(a[0]) - aligned(b[0]) || cornerDist(a[0]) - cornerDist(b[0]));

  /** The first captioned cell of this kind whose value the reader accepts. */
  function pick(
    kind: FieldKind,
    read: (text: string, g: Tok[]) => string | null,
    o: { join?: boolean; multi?: boolean; wide?: boolean } = {},
  ): Used | null {
    for (const [L, l] of labelled(kind)) {
      const right = rightGroup(L, cx);
      const below = belowGroup(L, cx, { multi: o.multi === true, wide: o.wide === true });
      const groups: Tok[][] = [];
      const add = (g: Tok[]) => g.length && groups.push(g);
      if (o.join) {
        add(right);
        if (right.length > 1) add([right[0]]);
      } else {
        if (right.length) add([right[0]]);
        if (right.length > 1) add(right);
      }
      add(below);
      for (const g of groups) {
        // A bare word ("Title", "Sheet") is a caption only with a colon or a much bigger value.
        if (l.weak && !l.colon && !(g[0].h >= 1.5 * L.h)) continue;
        const v = read(joinToks(g), g);
        if (v !== null) return { value: v, toks: [L, ...g] };
      }
    }
    return null;
  }

  // ── sheet number
  let idUsed: Used | null = pick("sheetId", (t) => readSheetId(t, true));
  let anchor: Tok | null = idUsed ? idUsed.toks[1] : null;
  if (idUsed) idLabel = idUsed.toks[0];
  if (!idUsed) {
    // "SHEET NO: A101" written as one run.
    for (const t of toks) {
      if (!inBand(t)) continue;
      const m = t.s.match(/^(?:SHEET|SHT|DWG|DRG|DRAWING)\s*(?:NO\.?|NUMBER|#)\s*[:#-]\s*(.+)$/i);
      const v = m ? readSheetId(m[1], true) : null;
      if (v) {
        idUsed = { value: v, toks: [t] };
        anchor = t;
        break;
      }
    }
  }
  if (!idUsed) {
    // "sht 3 of 22": the sheet's place in the set, with the total after it.
    for (const t of toks) {
      if (!inBand(t)) continue;
      const m = t.s.match(/(?:^|[\s/])(?:SHT|SHEET)\.?\s*(\d{1,3})(?:\s+(?:OF|\/)\s*\d{1,3})?\s*$/i);
      if (!m) continue;
      const total = /(?:OF|\/)\s*\d{1,3}\s*$/i.test(t.s)
        ? [t]
        : toks.filter((u) => u !== t && /^(?:OF|\/)\s*\d{1,3}$/i.test(u.s) && Math.abs(u.base - t.base) <= 6 && u.x0 >= t.x0 - 4 && u.x0 <= t.x1 + 30);
      if (total.length) {
        idUsed = { value: `SHT ${Number(m[1])}`, toks: [t, ...total.filter((u) => u !== t)] };
        anchor = t;
        break;
      }
    }
  }
  if (!idUsed) {
    // The biggest sheet-number-shaped run in the outer band, with a caption near it.
    const hs = toks.map((t) => t.h).sort((a, b) => a - b);
    const median = hs[Math.floor(hs.length / 2)] ?? 0;
    const pool = toks.filter((t) => inBand(t) && !claimed.has(t) && !info.has(t) && readSheetId(t.s, false) !== null);
    pool.sort((a, b) => b.h - a.h || cornerDist(a) - cornerDist(b));
    const best = pool[0];
    if (best && best.h >= 1.35 * median && best.h >= 3) {
      const nearLabel = [...info.keys()].some((l) => inBand(l) && Math.abs(l.x0 - best.x0) <= 90 && Math.abs(l.base - best.base) <= 90);
      // No caption at all: a number set at twice the page's text size in the bottom-right corner is still the sheet number.
      const inCorner = best.x0 >= 0.78 * W2 && best.base >= 0.85 * H2 && best.h >= 2 * median;
      if (nearLabel || inCorner) {
        idUsed = { value: readSheetId(best.s, false) as string, toks: [best] };
        anchor = best;
      }
    }
  }

  anchorTok = anchor;
  if (anchor && !idLabel) {
    // The caption nearest a bare number (a huge "A120" among small captions) stands in for the sheet-number caption.
    const caps = [...info].filter(([t, l]) => l.kind !== "other" && inBand(t) && !l.generic && Math.hypot(t.x0 - anchor.x0, t.base - anchor.base) <= 90);
    if (caps.length && idUsed && idUsed.toks.length === 1 && !/^(?:SHT|SHEET)/.test(idUsed.value)) {
      idLabel = caps.sort((a, b) => Math.hypot(a[0].x0 - anchor.x0, a[0].base - anchor.base) - Math.hypot(b[0].x0 - anchor.x0, b[0].base - anchor.base))[0][0];
    }
  }

  // Is a run near the sheet number (the title block, not the drawing)?
  const near = (t: Tok) => !anchor || (Math.abs(t.x0 - anchor.x0) <= 140 && Math.abs(t.base - anchor.base) <= 45);

  /** A field written as one run: "Scale: 1:50", "DATE: 12/08/2025", "REV: B". */
  function inline(rx: RegExp, read: (t: string) => string | null): Used | null {
    for (const t of toks) {
      if (!inBand(t) || !near(t)) continue;
      const m = t.s.match(rx);
      const v = m ? read(m[1]) : null;
      if (v) return { value: v, toks: [t] };
    }
    return null;
  }

  // ── the other fields
  const scaleUsed =
    pick("scale", (t) => (looksLikeScale(t) ? t : null), { join: true }) ??
    inline(/^SCALE\s*[:=-]\s*(.+)$/i, (t) => (looksLikeScale(t) ? t.trim() : null));
  let revUsed = pick("revision", readRevision) ?? inline(/^REV(?:ISION)?\s*[:#-]\s*(.+)$/i, readRevision);
  let dateUsed: Used | null =
    pick("date", (t, g) => {
      const dates = g.map((x) => readDate(x.s)).filter((d): d is string => d !== null);
      if (dates.length) return dates.reduce((a, b) => (dateValue(b) > dateValue(a) ? b : a));
      return readDate(t);
    }, { join: true }) ?? inline(/^DATE\s*[:#-]\s*(.+)$/i, readDate);
  const projectUsed = pick("project", readProject) ?? inline(/^(?:PROJECT|JOB)\s*(?:NO\.?|NUMBER|#)\s*[:#-]\s*(.+)$/i, readProject);
  const statusUsed = pick("status", (t) => (t.trim() ? t.trim() : null), { join: true });
  let titleUsed: Used | null =
    pick("title", readTitle, { join: true, multi: true, wide: true }) ??
    inline(/^(?:DRAWING |SHEET )?TITLE\s*[:#-]\s*(.+)$/i, readTitle);

  // A revision table: with no revision cell of its own, the sheet is at the table's newest row (by date);
  // with one, the date is that revision's row.
  if (tables.length) {
    const corner = [...tables].sort((a, b) => cornerDist(a.head) - cornerDist(b.head));
    if (!revUsed) {
      for (const tb of corner) {
        const dated = tb.rows.filter((r) => r.date !== null);
        if (dated.length !== tb.rows.length) continue;
        const newest = dated.reduce((a, b) => (b.when > a.when ? b : a));
        revUsed = { value: readRevision(newest.rev.s) as string, toks: [tb.head, newest.rev] };
        if (!dateUsed && newest.date) dateUsed = { value: readDate(newest.date.s) as string, toks: [tb.dateHead, newest.date] };
        break;
      }
    } else if (!dateUsed) {
      for (const tb of corner) {
        const row = tb.rows.find((r) => r.rev.u === revUsed?.value && r.date !== null);
        if (row?.date) {
          dateUsed = { value: readDate(row.date.s) as string, toks: [tb.head, tb.dateHead, row.rev, row.date] };
          break;
        }
      }
    }
  }

  // ── unlabelled title and date, beside the block
  const cells = [idUsed, scaleUsed, revUsed, dateUsed].flatMap((u) => (u ? u.toks : [])).filter((t) => near(t));
  const blockToks = anchor ? [anchor, ...cells] : cells;
  if (blockToks.length && (!titleUsed || !dateUsed)) {
    const bx0 = Math.min(...blockToks.map((t) => t.x0));
    const bx1 = Math.max(...blockToks.map((t) => t.x1));
    const by0 = Math.min(...blockToks.map((t) => t.top));
    const by1 = Math.max(...blockToks.map((t) => t.bot));
    const win = (t: Tok) => t.x1 >= bx0 - 75 && t.x0 <= bx1 + 15 && t.bot >= by0 - 34 && t.top <= by1 + 14;
    const usedSet = new Set<Tok>(
      [idUsed, scaleUsed, revUsed, dateUsed, projectUsed, statusUsed, titleUsed].flatMap((u) => (u ? u.toks : [])),
    );
    const free = toks.filter((t) => win(t) && !usedSet.has(t) && !claimed.has(t));
    const distTo = (t: Tok) => Math.hypot(Math.max(bx0 - t.x1, 0, t.x0 - bx1), Math.max(by0 - t.bot, 0, t.top - by1));
    if (!titleUsed) {
      const refH = median(blockToks.map((t) => t.h));
      titleUsed = stackedTitle(free, isLabel, refH, distTo);
    }
    // A caption with no date under it means "not filled in": only a caption-less block ("Feb 2026" by "sht 3 of 22") is guessed.
    if (!dateUsed && !idLabel) {
      const dates = free.filter((t) => readDate(t.s) !== null).sort((a, b) => distTo(a) - distTo(b));
      if (dates[0]) dateUsed = { value: readDate(dates[0].s) as string, toks: [dates[0]] };
    }
  }

  const ids = new Set<number>();
  for (const u of [idUsed, titleUsed, revUsed, dateUsed, projectUsed, scaleUsed]) u?.toks.forEach((t) => ids.add(t.id));
  const score = (idUsed ? 3 : 0) + (titleUsed ? 2 : 0) + (revUsed ? 1 : 0) + (scaleUsed ? 1 : 0) + (dateUsed ? 1 : 0) + (projectUsed ? 1 : 0);
  return {
    sheetId: idUsed?.value ?? null,
    title: titleUsed?.value ?? null,
    revision: revUsed?.value ?? null,
    date: dateUsed?.value ?? null,
    project: projectUsed?.value ?? null,
    scale: scaleUsed?.value ?? null,
    status: statusUsed?.value ?? null,
    ids: [...ids].sort((a, b) => a - b),
    score,
  };
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * The title nobody captioned: the biggest lettered text stacked beside the
 * block, at least a quarter bigger than the block's own small print.
 */
function stackedTitle(free: Tok[], isLabel: (t: Tok) => boolean, refH: number, distTo: (t: Tok) => number): Used | null {
  const lettered = free.filter((t) => (t.s.match(/[A-Za-z]/g) ?? []).length >= 3 && readTitle(t.s) !== null && !RATIO_TAIL.test(t.s) && !looksLikeSentence(t.s));
  const strong = lettered.filter((t) => !isLabel(t));
  if (strong.length === 0) return null;
  const hmax = Math.max(...strong.map((t) => t.h));
  if (hmax < 1.25 * refH) return null;
  const big = lettered.filter((t) => t.h >= 0.9 * hmax).sort((a, b) => a.base - b.base || a.x0 - b.x0);
  // Stack neighbouring lines into clusters, keep the one nearest the block.
  const clusters: Tok[][] = [];
  for (const t of big) {
    const c = clusters.find((cl) => {
      const last = cl[cl.length - 1];
      const aligned =
        Math.abs(t.x0 - last.x0) <= 6 ||
        Math.abs((t.x0 + t.x1) / 2 - (last.x0 + last.x1) / 2) <= 10 ||
        (t.x0 <= last.x1 && t.x1 >= last.x0);
      return !sameRow(last, t) && t.base - last.base <= 1.9 * last.h + 1 && aligned;
    });
    if (c) c.push(t);
    else clusters.push([t]);
  }
  const withText = clusters.filter((cl) => cl.some((t) => strong.includes(t)));
  if (withText.length === 0) return null;
  withText.sort((a, b) => Math.min(...a.map(distTo)) - Math.min(...b.map(distTo)) || Math.max(...b.map((t) => t.h)) - Math.max(...a.map((t) => t.h)));
  const lines = withText[0];
  const text = readTitle(lines.map((t) => t.s).join(" "));
  return text ? { value: text, toks: lines } : null;
}

/** A drawing label ends in its scale: "NEW FLOOR PLAN 1:100". */
const RATIO_TAIL = /\s1\s*[:：]\s*\d+(?:\.\d+)?\s*$/;

/** Running text, not a heading. */
function looksLikeSentence(s: string): boolean {
  const words = s.trim().split(/\s+/);
  return words.length > 9 || (words.length > 5 && /[.,;]$/.test(s));
}

type RevRow = { rev: Tok; date: Tok | null; when: number };
type RevTable = { head: Tok; dateHead: Tok; rows: RevRow[] };

/**
 * REV | DATE | DESCRIPTION tables: a revision caption and a date caption on one
 * row, with two or more revision marks stacked under (or over) the revision
 * caption. Which row is current is decided by the dates, never by position —
 * tables list newest-first as often as oldest-first.
 */
function revisionTables(toks: Tok[], info: Map<Tok, LabelInfo>, isLabel: (t: Tok) => boolean): RevTable[] {
  const heads = [...info].filter(([, l]) => l.kind === "revision").map(([t]) => t);
  const dateHeads = [...info].filter(([, l]) => l.kind === "date").map(([t]) => t);
  const out: RevTable[] = [];
  for (const r of heads) {
    for (const d of dateHeads) {
      if (!sameRow(r, d) || d.x0 <= r.x0 || d.x0 - r.x1 > 60) continue;
      const rc = (r.x0 + r.x1) / 2;
      const dc = (d.x0 + d.x1) / 2;
      const marks = toks.filter(
        (t) => t !== r && !isLabel(t) && t.s.length <= 3 && Math.abs((t.x0 + t.x1) / 2 - rc) <= 5 && Math.abs(t.base - r.base) <= 70 && Math.abs(t.base - r.base) > 1 && readRevision(t.s) !== null,
      );
      // The rows lie on one side of the heading.
      const sides = [marks.filter((t) => t.base > r.base), marks.filter((t) => t.base < r.base)].sort((a, b) => b.length - a.length);
      const rows = sides[0].map((rev): RevRow => {
        const date = toks.find((t) => sameRow(rev, t) && readDate(t.s) !== null && Math.abs((t.x0 + t.x1) / 2 - dc) <= 12) ?? null;
        return { rev, date, when: date ? dateValue(readDate(date.s) as string) : 0 };
      });
      if (rows.length >= 2) out.push({ head: r, dateHead: d, rows });
    }
  }
  return out;
}

// ── scale statements anywhere on the sheet ──────────────────────────────

/** Denominators drawings really use: everything else ("1:40", "1:60") is a pipe fall or a gradient. */
const SCALE_DENOMINATORS = new Set([1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000]);

const FALL_WORDS = /[ØøΦφ]|\bdia\b|\bmm\b|\bfall\b|\bgrade\b|\bgradient\b|\bslope\b|\bpitch\b|\bcrs\b|\bpipe\b|\bdrain\b/i;

const RATIO_LIST = /^1\s*[:：]\s*\d+(?:\.\d+)?(?:\s*[,/&]\s*1\s*[:：]\s*\d+(?:\.\d+)?)*(?:\s*(?:@|AT)\s*A[0-4])?$/i;

function scaleNotesOf(all: Tok[], titleBlockScale: string | null): { notes: string[]; ids: number[] } {
  const out: string[] = [];
  const ids: number[] = [];
  const bare = (s: string) => s.toLowerCase().replace(/^scale\s*[:=-]?\s*/, "");
  // Whole-ratio containment: "1:10" is inside "1:10 @ A3" but not inside "1:100".
  const contains = (hay: string, needle: string) => {
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
      if (!/[\d.:]/.test(hay[i - 1] ?? "") && !/[\d.]/.test(hay[i + needle.length] ?? "")) return true;
    }
    return false;
  };
  const add = (s: string, id?: number) => {
    const t = s.replace(/\s+/g, " ").trim();
    // "N.T.S" beside a sheet-scale "N.T.S @ A3", or "SCALE: 1:100 @ A3" beside "1:100 @ A3", says nothing new.
    if (t && !out.some((o) => contains(bare(o), bare(t)))) {
      out.push(t);
      if (id !== undefined) ids.push(id);
    }
  };
  if (titleBlockScale) add(titleBlockScale);
  const upright = all.filter((t) => t.angle <= 3 || t.angle >= 357);
  // "1:60" beside "Ø100mm", or in a column headed "Fall", is a pipe gradient.
  const fallContext = (t: Tok) =>
    upright.some(
      (u) =>
        u !== t &&
        ((sameRow(t, u) && u.x1 <= t.x0 + 0.5 && t.x0 - u.x1 <= 16 && FALL_WORDS.test(u.s)) ||
          (Math.abs(u.base - t.base) <= 80 && Math.abs(u.x0 - t.x0) <= 6 && /^(?:fall|gradient|grade|slope)$/i.test(u.s))),
    );
  const sorted = [...all].sort((a, b) => a.base - b.base || a.x0 - b.x0);
  for (const t of sorted) {
    const s = t.s;
    if (s.length > 60) continue;
    // "SCALE 1 : 10", "Scale: 1:50", "A4 Scale 1: 500"
    if (/\bscale\b/i.test(s) && RATIO.test(s)) {
      add(s, t.id);
      continue;
    }
    // "1:100 @ A3", "1:100, 1:20 @ A3", a lone "1 : 10" (only real drawing scales)
    if (RATIO_LIST.test(s)) {
      const dens = [...s.matchAll(/1\s*[:：]\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      if (dens.length && dens.every((d) => SCALE_DENOMINATORS.has(d) || /@|AT/i.test(s)) && !FALL_WORDS.test(s) && !fallContext(t)) add(s, t.id);
      continue;
    }
    // "NEW FLOOR PLAN 1:100": a drawing label that ends in its scale
    if (RATIO_TAIL.test(s) && /[A-Za-z]{3}/.test(s) && !FALL_WORDS.test(s)) {
      add(s, t.id);
      continue;
    }
    // "NTS", "N.T.S.", "As indicated"
    if (NO_RATIO.test(s.trim())) add(s, t.id);
  }
  return { notes: out.slice(0, 16), ids };
}

// ── approval stamp and draft marks ──────────────────────────────────────

const AUTHORITY_MIXED = /((?:[A-Z][A-Za-z'’-]*\s+(?:(?:of|and|the)\s+)?){1,6}(?:District|City|Regional|Territorial)\s+Council)/;
const AUTHORITY_UPPER = /((?:[A-Z][A-Z'’-]*\s+(?:(?:OF|AND|THE)\s+)?){1,6}(?:DISTRICT|CITY|REGIONAL|TERRITORIAL)\s+COUNCIL)/;
const BC_NUMBER = /\b(?:BC\s*(?:NO\.?|NUMBER|#)?|(?:BUILDING\s+)?CONSENT\s*(?:NO\.?|NUMBER|#))\s*[:.#-]?\s*(?:BC)?\s*(\d{4,8})\b/i;

function authorityIn(s: string): string | null {
  const m = s.match(AUTHORITY_UPPER) ?? s.match(AUTHORITY_MIXED);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function readConsent(all: Tok[]): SheetTitle["consent"] {
  let approved = false;
  let number: string | null = null;
  let authority: string | null = null;
  const stampy = /\bAPPROVED\b|\bMUST REMAIN ON.?SITE\b/i;
  const withinReach = (a: Tok, b: Tok) => Math.hypot(a.x0 - b.x0, a.base - b.base) <= 150;
  for (const t of all) {
    if (t.s.length > 220) continue;
    const auth = authorityIn(t.s);
    const bc = t.s.match(BC_NUMBER);
    const stamp = stampy.test(t.s);
    if (stamp && (auth || bc || /\bFOR CONSTRUCTION\b|\bREMAIN ON.?SITE\b|\b(?:PLANS?|DRAWINGS?) APPROVED\b/i.test(t.s))) {
      approved = true;
    }
    // A lone "APPROVED" counts when the council / consent number is printed right by it.
    if (!approved && /^APPROVED\.?$/i.test(t.s) && all.some((u) => u !== t && withinReach(t, u) && (authorityIn(u.s) || BC_NUMBER.test(u.s)))) {
      approved = true;
    }
  }
  const docish = all.some((t) =>
    /\bForm 5\b|\(Form 5\)|Section 51\b|Required Items for Building Consent|Code Compliance Certificate|Compliance Schedule|s90 Building Act/i.test(t.s),
  );
  for (const t of all) {
    if (t.s.length > 220) continue;
    const bc = t.s.match(BC_NUMBER);
    if (bc && number === null && (approved || docish)) number = `BC${bc[1]}`;
    const auth = authorityIn(t.s);
    if (auth && authority === null && (approved || docish || bc)) authority = auth;
  }
  return { approved, number, authority };
}

const DRAFT_EXACT = /^(?:DRAFT|PRELIMINARY)(?:\s+(?:ONLY|ISSUE|COPY|DRAWINGS?|SET|PLANS?|VERSION|STATUS|FOR\s+(?:REVIEW|COMMENT|DISCUSSION)))?$/;

function isDraft(all: Tok[], status: string | null): boolean {
  if (status && /\b(?:DRAFT|PRELIMINARY|NOT FOR CONSTRUCTION)\b/i.test(status)) return true;
  for (const t of all) {
    if (t.s.length > 60) continue;
    const bare = t.u.replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ").trim();
    if (DRAFT_EXACT.test(bare)) return true;
    if (/\bNOT FOR (?:CONSTRUCTION|BUILDING)\b/.test(bare)) return true;
    // A huge, tilted watermark — often cut to "DRAF" when the last letter is a separate run.
    if (/^DRAFT?$/.test(bare) && (t.h >= 12 || t.angle % 90 !== 0)) return true;
  }
  return false;
}

// ── public ──────────────────────────────────────────────────────────────

/** How many upright / sideways runs the sheet has, to decide whether a rotated title block is worth trying. */
function sidewaysCount(items: readonly TextItem[], turn: 90 | 270): number {
  let n = 0;
  for (const it of items) if (Math.abs(((it.angle % 360) + 360) % 360 - turn) <= 3) n += 1;
  return n;
}

export function readTitleBlock(sheet: SheetRaw): SheetTitle {
  const { text, widthMm: W, heightMm: H } = sheet;
  let best = readFrame(text, W, H, 0);
  if (best.sheetId === null) {
    for (const turn of [90, 270] as const) {
      if (sidewaysCount(text, turn) < 4) continue;
      const r = readFrame(text, W, H, turn);
      if (r.score > best.score) best = r;
    }
  }
  // Text scans (scale statements, approval stamp, draft marks) don't care which way the text reads.
  const all: Tok[] = text.filter((it) => it.s.trim()).map((it) => makeTok(it, it.x, it.y));
  const scales = scaleNotesOf(all, best.scale);
  const consent = readConsent(all);
  return {
    sheetId: best.sheetId,
    title: best.title,
    scaleNotes: scales.notes,
    revision: best.revision,
    date: best.date,
    project: best.project,
    consent,
    draft: isDraft(all, best.status),
    textIds: [...new Set([...best.ids, ...scales.ids])].sort((a, b) => a - b),
  };
}
