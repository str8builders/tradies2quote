import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { pdfParagraphs, pdfText } from "./pdf-text";

let helvetica: PDFFont;
beforeAll(async () => {
  helvetica = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
});

/** pdf-lib throws on any character the standard font's WinAnsi encoding lacks. */
function drawable(text: string): boolean {
  try {
    helvetica.widthOfTextAtSize(text, 10);
    return true;
  } catch {
    return false;
  }
}

describe("pdfText — what the standard PDF font can print", () => {
  it("keeps money symbols (the UK VAT quote printed ?1,234.50)", () => {
    expect(pdfText("£1,234.50")).toBe("£1,234.50");
    expect(pdfText("€90.00")).toBe("€90.00");
    expect(pdfText("¥500")).toBe("¥500");
  });

  it("keeps accented letters and typography WinAnsi has", () => {
    expect(pdfText("Café")).toBe("Café");
    expect(pdfText("Crème brûlée, Zoë, Ñandú")).toBe("Crème brûlée, Zoë, Ñandú");
    expect(pdfText("2 × 4 m² and 3 m³ at 90°")).toBe("2 × 4 m² and 3 m³ at 90°");
    expect(pdfText("“Quoted” ‘text’ – and — dashes…")).toBe("“Quoted” ‘text’ – and — dashes…");
    expect(pdfText("Jo’s Builders™ • ©")).toBe("Jo’s Builders™ • ©");
  });

  it("turns macron vowels into plain letters — Māori place names read cleanly", () => {
    expect(pdfText("Pāpāmoa")).toBe("Papamoa");
    expect(pdfText("Whangārei")).toBe("Whangarei");
    expect(pdfText("Ōtautahi")).toBe("Otautahi");
    expect(pdfText("Taupō")).toBe("Taupo");
    expect(pdfText("Tāmaki Makaurau")).toBe("Tamaki Makaurau");
    expect(pdfText("Ōhope Beach, Whakatāne")).toBe("Ohope Beach, Whakatane");
    // Written with combining marks instead of precomposed letters.
    expect(pdfText("Pa\u0304pa\u0304moa")).toBe("Papamoa");
    expect(pdfText("Cafe\u0301")).toBe("Café");
    // Only the letters the font lacks change (ó is in WinAnsi; Ł has no decomposition).
    expect(pdfText("Łódź")).toBe("Lódz");
  });

  it("swaps common symbols the font lacks for plain equivalents", () => {
    expect(pdfText("Rafters → 600 ctrs, ≥ 90 mm, ≤ 1.2 m")).toBe("Rafters -> 600 ctrs, >= 90 mm, <= 1.2 m");
    expect(pdfText("−5 °C, 6′ 2″")).toBe("-5 °C, 6' 2\"");
  });

  it("prints one ? for an emoji, whatever it is made of", () => {
    expect(pdfText("Thanks 👍")).toBe("Thanks ?");
    expect(pdfText("👍🏽")).toBe("?");
    expect(pdfText("❤️")).toBe("?");
    expect(pdfText("👨‍👩‍👧")).toBe("?");
    expect(pdfText("NZ 🇳🇿 made")).toBe("NZ ? made");
    expect(pdfText("漢字")).toBe("??");
  });

  it("drops invisible characters and flattens line breaks and odd spaces", () => {
    expect(pdfText("soft\u00adhyphen")).toBe("softhyphen");
    expect(pdfText("zero\u200bwidth\ufeff")).toBe("zerowidth");
    expect(pdfText("line one\nline two\tend")).toBe("line one line two end");
    expect(pdfText("12\u202f345\u2009m")).toBe("12 345 m");
    expect(pdfText(null)).toBe("");
    expect(pdfText(undefined)).toBe("");
  });

  it("everything it returns can be drawn", () => {
    const samples: string[] = [];
    for (let cp = 0; cp <= 0x2fff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      samples.push(String.fromCodePoint(cp));
    }
    samples.push("👍", "🇳🇿", "👨‍👩‍👧", "1️⃣", "🏗️", "Pāpāmoa £1,234.50 €9 “x” — ok");
    for (const sample of samples) {
      const out = pdfText(sample);
      expect(drawable(out), `U+${sample.codePointAt(0)?.toString(16)} → ${JSON.stringify(out)}`).toBe(true);
    }
  });

  it("keeps every character the font can draw (except the invisible soft hyphen)", () => {
    for (let cp = 0x20; cp <= 0x2122; cp++) {
      const ch = String.fromCodePoint(cp);
      if (!drawable(ch) || cp === 0xad) continue;
      expect(pdfText(ch), `U+${cp.toString(16)}`).toBe(ch);
    }
  });
});

describe("pdfParagraphs — keeps the line breaks the tradie typed", () => {
  it("one entry per line, blank runs kept to one, none at the ends", () => {
    expect(
      pdfParagraphs("\nQuote valid 30 days from issue.\r\nFinal payment on completion.\n\n\n\nExcludes consents — ask Pāpāmoa council.\n\n"),
    ).toEqual([
      "Quote valid 30 days from issue.",
      "Final payment on completion.",
      "",
      "Excludes consents — ask Papamoa council.",
    ]);
  });

  it("never prints a line break as ?", () => {
    const joined = pdfParagraphs("a\nb\rc\u2028d").join("|");
    expect(joined).toBe("a|b|c|d");
    expect(joined).not.toContain("?");
    expect(pdfParagraphs(null)).toEqual([]);
  });
});
