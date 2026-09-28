/**
 * Text for the quote and invoice PDFs.
 *
 * pdf-lib's standard fonts (Helvetica) draw only the WinAnsi (Windows-1252)
 * character set, and throw on anything else. The old cleaners kept printable
 * ASCII and turned every other character into "?", so "£1,234.50" printed as
 * "?1,234.50", "Pāpāmoa" as "P?p?moa", "Café" as "Caf?" and every line break in
 * the terms as "?".
 *
 * `pdfText` keeps every character WinAnsi can draw (£ € é × ’ “ ” – — ² ³ …),
 * swaps a few common symbols it can't draw for plain equivalents (→ "->",
 * ≥ ">="), turns other accented letters into plain ones (macron vowels:
 * "Pāpāmoa" → "Papamoa"), drops invisible characters, and only then falls back
 * to one "?" per character (an emoji, a Chinese character).
 */

/** The 218 characters pdf-lib's WinAnsi encoding draws: printable ASCII, Latin-1 and the Windows-1252 extras. */
function isWinAnsi(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WIN_1252_EXTRAS.has(codePoint);
}

const WIN_1252_EXTRAS = new Set(
  Array.from("ŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™", (c) => c.codePointAt(0) as number),
);

/** Characters WinAnsi lacks, with a plain equivalent it has. */
const REPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~",
  "−": "-", // minus sign
  "‐": "-", // hyphen
  "‑": "-", // non-breaking hyphen
  "‒": "-", // figure dash
  "―": "-", // horizontal bar
  "⁃": "-", // hyphen bullet
  "′": "'", // prime (feet)
  "″": '"', // double prime (inches)
  "‛": "'",
  "‟": '"',
  "⁄": "/", // fraction slash
  "●": "•",
  "▪": "•",
  "‣": "•",
  "◦": "•",
  "✕": "x",
  "✖": "x",
  "⨯": "x",
  "μ": "µ", // Greek mu → micro sign
  "℃": "°C",
  "℉": "°F",
  "№": "No.",
  "ℓ": "l",
  // Letters with no decomposition to a plain letter.
  "ł": "l",
  "Ł": "L",
  "đ": "d",
  "Đ": "D",
  "ħ": "h",
  "Ħ": "H",
  "ı": "i",
  "ŀ": "l",
  "Ŀ": "L",
  "ŧ": "t",
  "Ŧ": "T",
  "ſ": "s",
};

/** Spaces WinAnsi lacks (thin, narrow no-break, em…) print as a plain space. */
const OTHER_SPACES = /[\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
/** Line breaks, tabs and other whitespace controls. */
const BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]/g;
/** Invisible format and control characters (soft hyphen, zero-width space, joiners, BOM, direction marks…). */
const INVISIBLE = /^[\p{Cc}\p{Cf}]+$/u;
const COMBINING = /\p{M}/gu;

let segmenter: Intl.Segmenter | null | undefined;
function graphemes(text: string): string[] {
  if (segmenter === undefined) {
    segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  }
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

function allWinAnsi(text: string): boolean {
  for (const ch of text) {
    if (!isWinAnsi(ch.codePointAt(0) as number)) return false;
  }
  return text.length > 0;
}

/** One user-perceived character, as WinAnsi text. */
function cleanGrapheme(cluster: string): string {
  if (INVISIBLE.test(cluster)) return "";
  if (allWinAnsi(cluster)) return cluster;
  const replaced = REPLACEMENTS[cluster];
  if (replaced !== undefined) return replaced;
  const composed = cluster.normalize("NFC");
  if (allWinAnsi(composed)) return composed;
  // Strip accents the font can't draw (ā → a) and variation selectors.
  const plain = Array.from(composed.normalize("NFD").replace(COMBINING, ""), (ch) => REPLACEMENTS[ch] ?? ch).join("");
  if (plain === "") return ""; // a stray combining mark or selector on its own
  if (allWinAnsi(plain)) return plain;
  return "?";
}

/**
 * One line of text the standard PDF fonts can draw. Line breaks and tabs
 * become spaces; see `pdfParagraphs` to keep line breaks.
 */
export function pdfText(input: string | null | undefined): string {
  if (!input) return "";
  const text = String(input).replace(BREAKS, " ").replace(OTHER_SPACES, " ");
  // Fast path: plain printable ASCII needs nothing.
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return graphemes(text).map(cleanGrapheme).join("");
}

/**
 * Multi-line text (terms, an address) as drawable paragraphs: one entry per
 * line, with runs of blank lines kept to one and none at either end. Each
 * entry is `pdfText`-clean.
 */
export function pdfParagraphs(input: string | null | undefined): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const raw of String(input).split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/)) {
    const line = pdfText(raw).trim();
    if (line || (out.length > 0 && out[out.length - 1] !== "")) out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}
