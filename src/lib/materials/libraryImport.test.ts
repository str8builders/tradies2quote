import { describe, expect, it } from "vitest";
import {
  keepMoreReliable,
  libraryPatch,
  librarySaveOutcome,
  matchSavedItems,
  mergeRepeatedNames,
  type LibraryImportRow,
} from "./libraryImport";

const row = (name: string, over: Partial<LibraryImportRow> = {}): LibraryImportRow => ({
  name,
  unit: "each",
  default_unit_price: 10,
  sku: null,
  supplier: null,
  supplier_url: null,
  notes: null,
  ...over,
});

describe("merging a name on two lines", () => {
  it("keeps the clearer read, and a code only the other line had", () => {
    const { rows, merged } = mergeRepeatedNames(
      [row("Joist hanger", { default_unit_price: 4.2, confidence: 0.6, sku: "JH190" }), row("Nails"), row("joist  HANGER", { default_unit_price: 4.35, confidence: 0.95 })],
      keepMoreReliable,
    );
    expect(rows.map((r) => [r.name, r.default_unit_price, r.sku])).toEqual([
      ["joist  HANGER", 4.35, "JH190"],
      ["Nails", 10, null],
    ]);
    expect(merged).toEqual([{ name: "joist  HANGER", count: 2 }]);
  });

  it("on a tie, keeps the more complete line and never borrows the other line's unit", () => {
    const kept = keepMoreReliable(row("Ply", { unit: "each", confidence: 0.9 }), row("Ply", { unit: "sheet", sku: "PLY17", confidence: 0.9, default_unit_price: 89 }));
    expect(kept).toMatchObject({ unit: "sheet", sku: "PLY17", default_unit_price: 89 });
    const first = keepMoreReliable(row("Ply", { unit: "sheet", confidence: 0.9 }), row("Ply", { unit: "each", confidence: 0.9, default_unit_price: 1 }));
    expect(first).toMatchObject({ unit: "sheet", default_unit_price: 10 });
  });
});

describe("matching saved items", () => {
  it("matches by code first, then by name; two rows on one item keep the later", () => {
    const saved = [
      { id: "a", name: "Old framing name", sku: "KT9045", notes: null },
      { id: "b", name: "Nails", sku: null, notes: null },
    ];
    const { inserts, updates, superseded } = matchSavedItems(
      [row("90x45 framing", { sku: "kt9045" }), row("NAILS"), row("Framing again", { sku: "KT9045" }), row("Brand new")],
      saved,
    );
    expect(inserts.map((r) => r.name)).toEqual(["Brand new"]);
    expect(updates.map((u) => [u.target.id, u.row.name])).toEqual([
      ["a", "Framing again"],
      ["b", "NAILS"],
    ]);
    expect(superseded).toEqual([
      { name: "90x45 framing", reason: "Matches the same saved item (“Old framing name”) as “Framing again” — the later row was used" },
    ]);
  });

  it("patches only what the import carries, and never the tradie's own notes", () => {
    const target = { id: "a", name: "Hinge", sku: null, notes: "my note" };
    expect(libraryPatch(row("Hinge", { unit: null, default_unit_price: null }), target)).toEqual({});
    expect(libraryPatch(row("Hinge", { notes: "file note", supplier: "Kauri" }), target, { is_ai_estimated: false })).toEqual({
      unit: "each",
      default_unit_price: 10,
      is_ai_estimated: false,
      supplier: "Kauri",
    });
    expect(libraryPatch(row("Hinge", { notes: "file note" }), { ...target, notes: " " })).toMatchObject({ notes: "file note" });
  });
});

describe("librarySaveOutcome — the done screen tells the truth", () => {
  it("nothing saved is an error, never 'Added to your library'", () => {
    const o = librarySaveOutcome({ inserted: 0, updated: 0, failed: 3, failedNames: ["A", "B", "C"] });
    expect(o.tone).toBe("bad");
    expect(o.title).toBe("Nothing was saved to your library");
    expect(o.title + o.detail).not.toMatch(/Added/);
    expect(o.detail).toContain("“A”, “B”, “C”");
    expect(librarySaveOutcome({ inserted: 0, updated: 0, failed: 0, error: "Could not read existing library." }).detail).toBe(
      "Could not read existing library.",
    );
  });

  it("some failed: says how many were saved and names the rest", () => {
    const o = librarySaveOutcome({ inserted: 2, updated: 1, failed: 1, failedNames: ["Bad line"] });
    expect(o).toEqual({
      tone: "partial",
      title: "Saved 3 of 4 to your library",
      detail: "2 new, 1 updated. Not saved: “Bad line”. Add them by hand, or scan again.",
    });
  });

  it("all saved", () => {
    expect(librarySaveOutcome({ inserted: 2, updated: 0, failed: 0 })).toEqual({ tone: "ok", title: "Added to your library", detail: "2 new." });
  });
});
