// /app/materials/capture: with the new look on (always, in the iPhone app) it
// is the new-look "Copy a supplier's price" screen; off, the old page as
// before. Either way the form starts from the same values: what a share
// sheet handed over (?title=&text=&url=, ?supplier=) and the tradie's own
// tax rate.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  newLook: false,
  user: { id: "user-1" } as { id: string } | null,
  taxRate: 15 as number | null,
}));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.newLook }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: env.user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tax_rate: env.taxRate } }) }) }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("../../_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("../actions", () => ({ createMaterial: vi.fn() }));

import CapturePage from "./page";
import { AppHeader } from "../../_components/AppHeader";
import { CaptureForm } from "./_components/CaptureForm";
import { CaptureScreen } from "./_newlook/CaptureScreen";

type Tree = ReactElement<Record<string, unknown>>;
type Params = { title?: string; text?: string; url?: string; supplier?: string };

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

const page = async (params: Params = {}) =>
  (await CapturePage({ searchParams: Promise.resolve(params) })) as Tree;

/** The form's starting values in whichever look is on. */
async function formProps(params: Params = {}) {
  const tree = await page(params);
  return (env.newLook ? tree : ofType(tree, CaptureForm))?.props;
}

const MITRE = "https://www.mitre10.co.nz/shop/gib-standard-10mm";
const PASTE_ROUTE = { taxRate: 0.15, initialUrl: "", initialName: "", initialSupplier: "", isPasteFallback: true };

beforeEach(() => {
  env.newLook = false;
  env.user = { id: "user-1" };
  env.taxRate = 15;
});

describe("/app/materials/capture, the new-look switch", () => {
  it("off: the old page, its header and the outdoor safety net, as before", async () => {
    const tree = await page();
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(ofType(tree, AppHeader)?.props.context).toBe("Materials · Capture");
    expect(ofType(tree, "main")?.props["data-legacy-body"]).toBe("");
    expect(ofType(tree, CaptureForm)?.props).toEqual(PASTE_ROUTE);
    expect(ofType(tree, CaptureScreen)).toBeNull();
  });

  // What the screen draws (no old header, no safety-net marker) is pinned by
  // _newlook/CopyPrice.render.test.tsx.
  it("on: the new-look screen, with the same values", async () => {
    env.newLook = true;
    const tree = await page();
    expect(tree.type).toBe(CaptureScreen);
    expect(tree.props).toEqual(PASTE_ROUTE);
  });

  it.each([false, true])("new look %s: a shared product arrives filled in, the same either way", async (on) => {
    env.newLook = on;
    expect(await formProps({ title: "GIB Standard 10mm 2400x1200 - Mitre 10", url: MITRE })).toEqual({
      taxRate: 0.15,
      initialUrl: MITRE,
      initialName: "GIB Standard 10mm 2400x1200",
      initialSupplier: "Mitre 10",
      isPasteFallback: false,
    });
    // Some share sheets put the link in `text`; a named supplier wins over the link's.
    expect(await formProps({ text: MITRE, supplier: "Mitre 10 Mega" })).toMatchObject({
      initialUrl: MITRE,
      initialSupplier: "Mitre 10 Mega",
      isPasteFallback: false,
    });
  });

  it.each([false, true])("new look %s: the tradie's own tax rate, 15 % when none is set", async (on) => {
    env.newLook = on;
    env.taxRate = 20;
    expect((await formProps())?.taxRate).toBe(0.2);
    env.taxRate = null;
    expect((await formProps())?.taxRate).toBe(0.15);
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(page()).rejects.toThrow("NEXT_REDIRECT /login");
    env.newLook = true;
    await expect(page()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
