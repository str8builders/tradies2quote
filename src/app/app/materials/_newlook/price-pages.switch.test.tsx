// The new-look switch on "Add a price" (/app/materials/new) and "Change
// price" (/app/materials/[id]/edit): the pages are called as plain async
// functions and their trees inspected. Off: the old pages, as before.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  on: false,
  user: { id: "user-1" } as { id: string } | null,
  material: null as Record<string, unknown> | null,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: env.user } }) },
    from: () => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          env.filters.push([column, value]);
          return builder;
        },
        single: async () => (env.material ? { data: env.material, error: null } : { data: null, error: { code: "PGRST116" } }),
      };
      return builder;
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("../actions", () => ({ createMaterial: vi.fn(), updateMaterial: vi.fn(), deleteMaterial: vi.fn() }));

import NewMaterialPage from "../new/page";
import EditMaterialPage from "../[id]/edit/page";
import { MaterialForm } from "../_components/MaterialForm";
import { PriceFormScreen } from "./PriceFormScreen";

function findAll(node: unknown, type: unknown): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.type === type) found.push(element);
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

const edit = () => EditMaterialPage({ params: Promise.resolve({ id: "m1" }) });

beforeEach(() => {
  env.on = false;
  env.user = { id: "user-1" };
  env.filters = [];
  env.material = {
    id: "m1",
    name: "GIB Standard 10mm",
    unit: null,
    default_unit_price: "24.50",
    supplier: "Mitre 10",
    supplier_url: null,
    notes: null,
  };
});

describe("/app/materials/new", () => {
  it("off: the old page and form", async () => {
    const tree = (await NewMaterialPage()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, MaterialForm).map((el) => el.props.mode)).toEqual(["create"]);
    expect(findAll(tree, PriceFormScreen)).toHaveLength(0);
  });

  it("on: Add a price", async () => {
    env.on = true;
    const tree = (await NewMaterialPage()) as ReactElement<{ mode: string }>;
    expect(tree.type).toBe(PriceFormScreen);
    expect(tree.props.mode).toBe("create");
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(NewMaterialPage()).rejects.toThrow("NEXT_REDIRECT /login");
    env.on = true;
    await expect(NewMaterialPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("/app/materials/[id]/edit", () => {
  const initial = {
    id: "m1",
    name: "GIB Standard 10mm",
    unit: "each",
    default_unit_price: 24.5,
    supplier: "Mitre 10",
    supplier_url: null,
    notes: null,
  };

  it("off: the old page, with the same values as before", async () => {
    const tree = (await edit()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    const [form] = findAll(tree, MaterialForm);
    expect(form.props).toEqual({ mode: "edit", initial });
    expect(findAll(tree, PriceFormScreen)).toHaveLength(0);
  });

  it("on: Change price, loaded for this tradie only", async () => {
    env.on = true;
    const tree = (await edit()) as ReactElement<Record<string, unknown>>;
    expect(tree.type).toBe(PriceFormScreen);
    expect(tree.props).toEqual({ mode: "edit", initial });
    expect(env.filters).toEqual([
      ["id", "m1"],
      ["user_id", "user-1"],
    ]);
  });

  it("someone else's (or a missing) price goes back to Prices either way", async () => {
    env.material = null;
    await expect(edit()).rejects.toThrow("NEXT_REDIRECT /app/materials");
    env.on = true;
    await expect(edit()).rejects.toThrow("NEXT_REDIRECT /app/materials");
  });
});
