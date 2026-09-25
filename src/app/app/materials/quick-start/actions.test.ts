import { describe, expect, it, vi } from "vitest";

// The quick-start price form kept each price to the cent with a plain
// Math.round(n * 100) / 100 ($4.015 → $4.01). It now uses the app's one money
// rule, quote-defaults.round2 (exact half-up).

const db = vi.hoisted(() => ({ upserted: [] as Array<Record<string, unknown>> }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({
      upsert: async (rows: Array<Record<string, unknown>>) => {
        db.upserted.push(...rows);
        return { error: null };
      },
    }),
  }),
}));

import { STARTER_MATERIALS } from "./_data";
import { saveQuickStartMaterials } from "./actions";

describe("saveQuickStartMaterials — prices to the cent, exact half-up", () => {
  it("$4.015 is saved as $4.02 and $8.075 as $8.08 (plain float rounding saved $4.01 / $8.07)", async () => {
    const [first, second] = STARTER_MATERIALS;
    const form = new FormData();
    form.set(`price_${first.slug}`, "4.015");
    form.set(`price_${second.slug}`, "8.075");
    await expect(saveQuickStartMaterials({ ok: true, inserted: 0, skipped: 0 }, form)).rejects.toThrow(
      "NEXT_REDIRECT /app?onboarded=2",
    );
    const price = (name: string) => db.upserted.find((r) => r.name === name)?.default_unit_price;
    expect(price(first.name)).toBe(4.02);
    expect(price(second.name)).toBe(8.08);
  });
});
