import { describe, expect, it } from "vitest";
import { libraryPriceForLine } from "@/lib/materials";
import type { LibraryMaterial } from "@/lib/quote-types";
import { STARTER_TRADES } from "./_data";

/**
 * A starter price only helps if the AI quote's line finds it: the quote
 * pipeline uses a library price only on a strong, specific, size-exact match
 * (libraryPriceForLine). Check every trade list priced as a whole library,
 * against the way a quote line names the same item.
 */
const asLibrary = (items: ReadonlyArray<{ name: string; unit: string }>): LibraryMaterial[] =>
  items.map((m, i) => ({
    id: `m${i}`,
    name: m.name,
    unit: m.unit,
    default_unit_price: 10 + i,
    supplier: null,
    supplier_url: null,
    notes: null,
    usage_count: 0,
    is_ai_estimated: false,
    last_used_at: null,
  }));

describe.each(STARTER_TRADES.map((t) => [t.label, t] as const))("%s starter list", (_label, trade) => {
  const library = asLibrary(trade.items);

  it("every item prices a quote line with its own name and unit", () => {
    trade.items.forEach((m, i) => {
      const hit = libraryPriceForLine({ description: m.name, unit: m.unit }, library);
      expect(hit?.unitPrice, m.name).toBe(10 + i);
    });
  });
});

describe("plumber and electrician lines worded the way a quote says them", () => {
  const plumber = asLibrary(STARTER_TRADES.find((t) => t.id === "plumber")!.items);
  const sparky = asLibrary(STARTER_TRADES.find((t) => t.id === "electrician")!.items);

  it.each([
    ["16mm PEX pipe", "m", plumber, "PEX pipe 16mm"],
    ["Tempering valve 15mm", "each", plumber, "Tempering valve 15mm"],
    ["2.5mm TPS cable twin and earth", "m", sparky, "TPS cable 2.5mm twin and earth"],
    ["RCD 2 pole 40A 30mA", "each", sparky, "RCD 2 pole 40A 30mA"],
  ] as const)("%s → %s", (description, unit, library, expected) => {
    const hit = libraryPriceForLine({ description, unit }, library);
    expect(hit?.match.item.name).toBe(expected);
    expect(hit?.unitPrice).not.toBeNull();
  });

  it("a 25mm pipe never takes the 16mm or 20mm price", () => {
    const hit = libraryPriceForLine({ description: "PEX pipe 25mm", unit: "m" }, plumber);
    expect(hit?.unitPrice ?? null).toBeNull();
  });
});
