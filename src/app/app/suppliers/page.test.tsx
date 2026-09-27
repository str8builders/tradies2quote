// /app/suppliers: with the new look on (always, in the iPhone app) it is the
// new-look "Shop supplier websites" screen, with the same link; off, the old
// page as before. Only an http(s) ?url= reaches either.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  newLook: false,
  user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.newLook }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: env.user } }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("../_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("./actions", () => ({ saveSupplierMaterial: vi.fn() }));

import SuppliersPage from "./page";
import { AppHeader } from "../_components/AppHeader";
import { SupplierBrowser } from "./_components/SupplierBrowser";
import { SuppliersScreen } from "./_newlook/SuppliersScreen";

type Tree = ReactElement<Record<string, unknown>>;

function find(node: unknown, match: (element: Tree) => boolean): Tree | null {
  let found: Tree | null = null;
  const visit = (value: unknown) => {
    if (found || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (!("props" in value)) return;
    const element = value as Tree;
    if (match(element)) found = element;
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}
const ofType = (node: unknown, type: unknown) => find(node, (element) => element.type === type);

const MITRE = "https://www.mitre10.co.nz/shop/tek-screws-12g";
const page = async (url?: string) =>
  (await SuppliersPage({ searchParams: Promise.resolve(url === undefined ? {} : { url }) })) as Tree;

beforeEach(() => {
  env.newLook = false;
  env.user = { id: "user-1" };
});

describe("/app/suppliers, the new-look switch", () => {
  it("off: the old page, its header and the outdoor safety net, as before", async () => {
    const tree = await page(MITRE);
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(ofType(tree, AppHeader)?.props.context).toBe("Suppliers");
    expect(find(tree, (element) => element.props["data-legacy-body"] === "")).not.toBeNull();
    expect(ofType(tree, SupplierBrowser)?.props).toEqual({ initialUrl: MITRE });
    expect(ofType(tree, SuppliersScreen)).toBeNull();
  });

  // What the screen draws (no old header, no safety-net marker) is pinned by
  // _newlook/SupplierShop.render.test.tsx.
  it("on: the new-look screen, with the same link", async () => {
    env.newLook = true;
    const tree = await page(MITRE);
    expect(tree.type).toBe(SuppliersScreen);
    expect(tree.props).toEqual({ initialUrl: MITRE });
    expect(ofType(tree, AppHeader)).toBeNull();
  });

  it("only an http(s) link is passed on, either way", async () => {
    for (const on of [false, true]) {
      env.newLook = on;
      for (const url of [undefined, "javascript:alert(1)", "www.bunnings.co.nz"]) {
        const tree = await page(url);
        const target = on ? tree : ofType(tree, SupplierBrowser);
        expect(target?.props.initialUrl, `${on ? "on" : "off"} ${url}`).toBe("");
      }
    }
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(page(MITRE)).rejects.toThrow("NEXT_REDIRECT /login");
    env.newLook = true;
    await expect(page(MITRE)).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
