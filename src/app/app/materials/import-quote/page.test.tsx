// /app/materials/import-quote: the scanner asks for AI consent first in the
// iPhone app (App Store 5.1.2(i)); never on the web. With the new look on
// (always, in the iPhone app) it is the new-look screen, with the same
// figures and the same consent rule; off, the old page as before.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  native: false,
  consented: false,
  newLook: false,
  user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
vi.mock("@/lib/ai-consent", () => ({ hasAiConsent: async () => env.consented }));
vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.newLook }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: env.user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { currency: "NZD", tax_rate: 15 } }) }) }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("../../_components/AppHeader", () => ({ AppHeader: () => null }));

import ImportQuotePage from "./page";
import { AppHeader } from "../../_components/AppHeader";
import { QuoteImportClient } from "./_components/QuoteImportClient";
import { ScanQuoteScreen } from "./_newlook/ScanQuoteScreen";

function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | null {
  let found: ReactElement<Record<string, unknown>> | null = null;
  const visit = (value: unknown) => {
    if (found || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (!("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.type === type) found = element;
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

const page = async () => (await ImportQuotePage()) as ReactElement<Record<string, unknown>>;

beforeEach(() => {
  env.native = false;
  env.consented = false;
  env.newLook = false;
  env.user = { id: "user-1" };
});

describe("/app/materials/import-quote", () => {
  it("on the web never asks for AI consent", async () => {
    expect(find(await ImportQuotePage(), QuoteImportClient)?.props.needsAiConsent).toBe(false);
  });

  it("in the iPhone app asks until consent is on record", async () => {
    env.native = true;
    expect(find(await ImportQuotePage(), QuoteImportClient)?.props.needsAiConsent).toBe(true);
    env.consented = true;
    expect(find(await ImportQuotePage(), QuoteImportClient)?.props.needsAiConsent).toBe(false);
  });
});

describe("/app/materials/import-quote, the new-look switch", () => {
  it("off: the old page, its header and the outdoor safety net, as before", async () => {
    const tree = await page();
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(find(tree, AppHeader)?.props.context).toBe("Materials");
    expect(find(tree, "main")?.props["data-legacy-body"]).toBe("");
    expect(find(tree, QuoteImportClient)?.props).toEqual({
      currency: "NZD",
      taxRate: 0.15,
      taxLabel: "GST",
      needsAiConsent: false,
    });
    expect(find(tree, ScanQuoteScreen)).toBeNull();
  });

  // What the screen draws (no old header, no safety-net marker) is pinned by
  // _newlook/ScanQuote.render.test.tsx.
  it("on: the new-look screen, with the same figures", async () => {
    env.newLook = true;
    const tree = await page();
    expect(tree.type).toBe(ScanQuoteScreen);
    expect(tree.props).toEqual({ currency: "NZD", taxRate: 0.15, taxLabel: "GST", needsAiConsent: false });
  });

  it("on, in the iPhone app: asks for consent until it's on record", async () => {
    env.newLook = true;
    env.native = true;
    expect((await page()).props.needsAiConsent).toBe(true);
    env.consented = true;
    expect((await page()).props.needsAiConsent).toBe(false);
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(ImportQuotePage()).rejects.toThrow("NEXT_REDIRECT /login");
    env.newLook = true;
    await expect(ImportQuotePage()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
