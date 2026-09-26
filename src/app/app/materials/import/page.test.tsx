// /app/materials/import: the new-look switch and the AI consent flag. The
// page is called as a plain async function and its tree inspected.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ newLook: false, native: false, consented: false }));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.newLook }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
vi.mock("@/lib/ai-consent", () => ({ hasAiConsent: async () => env.consented }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { tax_rate: 15, currency: "NZD", country: "NZ" } }) }),
      }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

import ImportMaterialsPage from "./page";
import { ImportClient } from "./_components/ImportClient";
import { PriceImportScreen } from "../_newlook/PriceImportScreen";

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
  env.newLook = false;
  env.native = false;
  env.consented = false;
});

describe("/app/materials/import", () => {
  it("with the new look off, is the current-look import", async () => {
    const tree = await ImportMaterialsPage();
    const client = findAll(tree, ImportClient);
    expect(client).toHaveLength(1);
    expect(client[0].props).toMatchObject({ taxRate: 0.15, taxLabel: "GST", needsAiConsent: false });
    expect(findAll(tree, PriceImportScreen)).toHaveLength(0);
  });

  it("with the new look on, is the new-look screen", async () => {
    env.newLook = true;
    const tree = (await ImportMaterialsPage()) as ReactElement<Record<string, unknown>>;
    expect(tree.type).toBe(PriceImportScreen);
    expect(tree.props).toMatchObject({ taxRate: 0.15, taxLabel: "GST", currency: "NZD", needsAiConsent: false });
  });

  it("in the iPhone app without AI consent, asks before a PDF or photo is read", async () => {
    env.native = true;
    expect(findAll(await ImportMaterialsPage(), ImportClient)[0].props.needsAiConsent).toBe(true);
    env.newLook = true;
    expect(((await ImportMaterialsPage()) as ReactElement<{ needsAiConsent: boolean }>).props.needsAiConsent).toBe(true);
    env.consented = true;
    expect(((await ImportMaterialsPage()) as ReactElement<{ needsAiConsent: boolean }>).props.needsAiConsent).toBe(false);
  });
});
