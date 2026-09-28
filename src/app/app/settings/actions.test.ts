import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Old-look Save writes only the fields the form sent: a field that wasn't on
 * the page is left alone instead of being blanked (audit 2026-09-28).
 */

const h = vi.hoisted(() => ({ upserts: [] as Array<Record<string, unknown>>, error: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        h.upserts.push(row);
        return { error: h.error };
      },
    }),
  }),
}));

import { saveSettings } from "./actions";
import { SAVE_SETTINGS_INITIAL } from "./_state";

const FULL = {
  business_name: "Bayside Builders",
  email: "office@bayside.co.nz",
  phone: "021 555 0101",
  address: "12 Rata St",
  gst_number: "123-456-789",
  payment_instructions: "Bank: 12-3456",
  country: "NZ",
  currency: "NZD",
  tax_rate: "15",
  default_labour_rate: "85",
  default_markup_pct: "20",
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  h.upserts = [];
  h.error = null;
});

describe("saveSettings", () => {
  it("saves every field the form sent, and clears ones sent empty", async () => {
    expect(await saveSettings(SAVE_SETTINGS_INITIAL, form({ ...FULL, gst_number: "" }))).toMatchObject({ status: "ok" });
    expect(h.upserts[0]).toMatchObject({
      id: "user-1",
      business_name: "Bayside Builders",
      gst_number: null,
      tax_rate: 15,
      default_labour_rate: 85,
    });
  });

  it("leaves fields the form didn't send untouched (never blanks them)", async () => {
    await saveSettings(SAVE_SETTINGS_INITIAL, form({ business_name: "Bayside Builders", tax_rate: "15" }));
    const row = h.upserts[0];
    expect(row).toMatchObject({ id: "user-1", business_name: "Bayside Builders", tax_rate: 15 });
    for (const untouched of ["email", "phone", "address", "gst_number", "payment_instructions", "country", "currency", "default_labour_rate", "default_markup_pct"]) {
      expect(row, untouched).not.toHaveProperty(untouched);
    }
  });

  it("still validates what was sent", async () => {
    expect(await saveSettings(SAVE_SETTINGS_INITIAL, form({ ...FULL, tax_rate: "150" }))).toMatchObject({ status: "error" });
    expect(h.upserts).toHaveLength(0);
  });
});
