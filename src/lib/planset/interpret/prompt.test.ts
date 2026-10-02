import { describe, expect, it } from "vitest";
import type { TextItem } from "../types";
import { TEXT_ONLY_MAX_CHARS, cleanRunText, formatRuns, sheetPrompt } from "./prompt";

const run = (id: number, s: string, x = 10, y = 20): TextItem => ({ id, s, x, y, angle: 0, h: 3, w: 30 });

describe("cleanRunText", () => {
  it("one space between words", () => {
    expect(cleanRunText("90 x 45\n  SG8\tH1.2")).toBe("90 x 45 SG8 H1.2");
  });

  it("drops control characters and replaces broken surrogate pairs, so the request is always valid JSON", () => {
    const messy = `R2.8${String.fromCharCode(0)} batts${String.fromCharCode(7)} \uD83D lone \uDE00 end \u{1F600} ok`;
    const clean = cleanRunText(messy);
    expect(clean).toBe("R2.8 batts � lone � end \u{1F600} ok");
    expect(JSON.parse(JSON.stringify(clean))).toBe(clean);
    expect(Buffer.from(clean, "utf8").toString("utf8")).toBe(clean);
  });

  it("leaves macrons, degree signs, plus-minus and en dashes alone", () => {
    expect(cleanRunText("Tāmaki 30° ±5 — 2400")).toBe("Tāmaki 30° ±5 — 2400");
  });
});

describe("formatRuns", () => {
  it("numbered, one per line, positions rounded", () => {
    expect(formatRuns([run(1, "Linea", 10.4, 20.6), run(2, "Colorsteel", 100, 5)])).toBe("1 | Linea | 10,21\n2 | Colorsteel | 100,5");
  });

  it("cuts off past the limit and says so", () => {
    const text = Array.from({ length: 50 }, (_, i) => run(i, "x".repeat(40)));
    const out = formatRuns(text, 500);
    expect(out.length).toBeLessThan(600);
    expect(out.split("\n").at(-1)).toMatch(/left out/);
  });
});

describe("sheetPrompt", () => {
  const input = { sheetId: "A00.2", title: "Notes", kind: "notes" as const, text: [run(1, "Linea weatherboard")] };

  it("with the page attached it is the same prompt as ever", () => {
    expect(sheetPrompt(input)).toBe(
      "Sheet A00.2 — Notes.\nThis is a notes/specification sheet: specs, zones and by_others are the main things to read.\n\nText runs:\n1 | Linea weatherboard | 10,20",
    );
  });

  it("words only: says the page isn't attached and keeps every run", () => {
    const p = sheetPrompt({ ...input, textOnly: true });
    expect(p).toContain("The page itself is not attached this time");
    expect(p).toContain("1 | Linea weatherboard | 10,20");
  });

  it("words only is capped well inside the model's context", () => {
    const text = Array.from({ length: 20_000 }, (_, i) => run(i, "x".repeat(100)));
    expect(sheetPrompt({ ...input, text, textOnly: true }).length).toBeLessThan(TEXT_ONLY_MAX_CHARS + 2_000);
    expect(sheetPrompt({ ...input, text }).length).toBeGreaterThan(TEXT_ONLY_MAX_CHARS);
  });
});
