// The new-look switch on /app/materials: the page is called as a plain async
// function and its returned tree inspected. Off: the old library page, as
// before. On: "Your prices".

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  on: false,
  user: { id: "user-1", email: "mike@bayside.co.nz" } as { id: string; email: string } | null,
}));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: env.user } }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
// Only found in the tree, never rendered.
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("../_components/ScanBarcodeButton", () => ({ ScanBarcodeButton: () => null }));

import MaterialsPage from "../page";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { SupplierShortcuts } from "../_components/SupplierShortcuts";
import { PricesScreen } from "./PricesScreen";

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

beforeEach(() => {
  env.on = false;
  env.user = { id: "user-1", email: "mike@bayside.co.nz" };
});

describe("/app/materials", () => {
  it("with the new look off, is the old library page, unchanged", async () => {
    const tree = (await MaterialsPage()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, AppHeader).map((el) => el.props.context)).toEqual(["Materials"]);
    expect(findAll(tree, SupplierShortcuts)).toHaveLength(1);
    expect(findAll(tree, PricesScreen)).toHaveLength(0);
  });

  it("with the new look on, is Your prices for the signed-in tradie", async () => {
    env.on = true;
    const tree = (await MaterialsPage()) as ReactElement<{ userId: string }>;
    expect(tree.type).toBe(PricesScreen);
    expect(tree.props.userId).toBe("user-1");
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(MaterialsPage()).rejects.toThrow("NEXT_REDIRECT /login");
    env.on = true;
    await expect(MaterialsPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
