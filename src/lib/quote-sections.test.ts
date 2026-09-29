import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OTHER_SECTION, lineSections, sectionOf } from "./quote-sections";

type Line = { description: string; section?: string | null; line_total: number };
const line = (description: string, line_total: number, section?: string | null): Line => ({ description, line_total, section });
const same = (l: Line) => l;

describe("lineSections", () => {
  it("leaves a quote without sections alone", () => {
    expect(lineSections([line("Screws", 80), line("Boards", 250, "  ")], same)).toBeNull();
    expect(lineSections([], same)).toBeNull();
  });

  it("splits by section in the order they first appear, each with a subtotal to the cent", () => {
    const out = lineSections(
      [line("Studs", 1200.1, "Framing"), line("GIB", 900, "Linings"), line("Plates", 300.2, "Framing"), line("Batts", 410.55, "Insulation")],
      same,
    );
    expect(out?.map((s) => [s.title, s.items.map((i) => i.description), s.subtotal])).toEqual([
      ["Framing", ["Studs", "Plates"], 1500.3],
      ["Linings", ["GIB"], 900],
      ["Insulation", ["Batts"], 410.55],
    ]);
  });

  it("puts lines added by hand last, under Other materials", () => {
    const out = lineSections([line("Skip bin", 400), line("Studs", 1200, "Framing"), line("Nails", 60, null)], same);
    expect(out?.map((s) => s.title)).toEqual(["Framing", OTHER_SECTION]);
    expect(out?.[1]).toMatchObject({ items: [{ description: "Skip bin" }, { description: "Nails" }], subtotal: 460 });
  });

  it("the sections add up to the whole list", () => {
    const lines = [line("a", 10.01, "A"), line("b", 20.02, "B"), line("c", 30.03), line("d", 0.04, "A")];
    const out = lineSections(lines, same)!;
    expect(out.reduce((s, x) => s + x.subtotal, 0)).toBeCloseTo(60.1, 10);
  });
});

describe("sectionOf", () => {
  it("trims, and treats blank or non-text as none", () => {
    expect(sectionOf({ section: " Framing " })).toBe("Framing");
    expect(sectionOf({ section: "" })).toBeNull();
    expect(sectionOf({ section: null })).toBeNull();
    expect(sectionOf({ section: 7 as unknown as string })).toBeNull();
  });
});

// The client's quote page gets each line through get_quote_by_token's
// explicit projection (quote_data also holds private working and AI notes);
// the version guard reads the same fields. Only the trade section was added.
describe("what the database gives a client's quote page for each line", () => {
  const dir = join(process.cwd(), "supabase/migrations");
  const latest = (fn: string) => {
    const files = readdirSync(dir).filter((f) => /^\d{8}_.*\.sql$/.test(f)).sort();
    const defining = files.filter((f) => readFileSync(join(dir, f), "utf8").includes(`function public.${fn}(`));
    return readFileSync(join(dir, defining[defining.length - 1]), "utf8");
  };
  const lineKeys = (sql: string, fn: string) => {
    const body = sql.slice(sql.indexOf(`function public.${fn}(`));
    const from = body.indexOf("'line_items'");
    return [...body.slice(from, body.indexOf("with ordinality", from)).matchAll(/'(\w+)',\s*item\s*->/g)].map((m) => m[1]);
  };

  it.each(["get_quote_by_token", "quote_customer_content"])("%s: the six line fields and the trade section, nothing private", (fn) => {
    expect(lineKeys(latest(fn), fn)).toEqual(["type", "description", "quantity", "unit", "unit_price", "line_total", "section"]);
  });
});
