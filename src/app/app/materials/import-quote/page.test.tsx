// /app/materials/import-quote: the scanner asks for AI consent first in the
// iPhone app (App Store 5.1.2(i)); never on the web.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ native: false, consented: false }));

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
vi.mock("@/lib/ai-consent", () => ({ hasAiConsent: async () => env.consented }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
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
import { QuoteImportClient } from "./_components/QuoteImportClient";

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

beforeEach(() => {
  env.native = false;
  env.consented = false;
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
