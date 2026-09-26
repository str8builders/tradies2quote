// Quick start (/app/materials/quick-start): the new-look switch, the new
// body rendered to static HTML in node (same field names and save action as
// the old form), and the old form still rendering as before.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ on: false, user: { id: "user-1" } as { id: string } | null }));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: env.user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { currency: "GBP" } }) }) }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("../actions", () => ({ saveQuickStartMaterials: vi.fn() }));

import MaterialsQuickStartPage from "../page";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { Screen } from "@/components/ui/screen";
import { QuickStartForm } from "../_components/QuickStartForm";
import { STARTER_MATERIALS } from "../_data";
import { QUICK_START_INTRO, QuickStartBody } from "./QuickStartBody";
import { perUnit } from "./QuickStartPrices";

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

/** The opening tag of the element holding a fragment (React orders some attributes itself). */
const tagWith = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

beforeEach(() => {
  env.on = false;
  env.user = { id: "user-1" };
});

describe("/app/materials/quick-start switch", () => {
  it("off: the old page with its own Back link and form", async () => {
    const tree = (await MaterialsQuickStartPage()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, QuickStartForm).map((el) => el.props.currency)).toEqual(["GBP"]);
    expect(findAll(tree, QuickStartBody)).toHaveLength(0);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('data-testid="quick-start-back"');
    expect(html).toContain("// boost quote accuracy");
  });

  it("on: the new body under the shared top bar, no second Back link", async () => {
    env.on = true;
    const tree = (await MaterialsQuickStartPage()) as ReactElement;
    expect(tree.type).toBe(Screen);
    expect(findAll(tree, AppHeader)).toHaveLength(1);
    expect(findAll(tree, QuickStartBody).map((el) => el.props.currency)).toEqual(["GBP"]);
    expect(renderToStaticMarkup(tree)).not.toContain('data-testid="quick-start-back"');
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(MaterialsQuickStartPage()).rejects.toThrow("NEXT_REDIRECT /login");
    env.on = true;
    await expect(MaterialsQuickStartPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("QuickStartBody (new look)", () => {
  const html = renderToStaticMarkup(<QuickStartBody currency="NZD" />);

  it("explains itself in plain words", () => {
    expect(html).toContain("The materials you use every week");
    expect(html).toContain(QUICK_START_INTRO.replace(/'/g, "&#x27;"));
  });

  it("one price box per starter item, named as the save action expects", () => {
    for (const m of STARTER_MATERIALS) {
      expect(html).toContain(`data-testid="row-${m.slug}"`);
      const input = html.match(new RegExp(`<input[^>]*name="price_${m.slug}"[^>]*>`))?.[0] ?? "";
      expect(input).toContain(`aria-label="Price for ${m.name}"`);
      expect(input).toContain('inputMode="decimal"');
      expect(input).toContain(`data-testid="price-${m.slug}"`);
    }
    expect(html).toContain(">per sheet<");
    expect(html).toContain(">$<");
  });

  it("save, or skip to Home", () => {
    expect(html).toContain('data-testid="quick-start-submit"');
    expect(html).toContain("Save and continue");
    const skip = tagWith(html, 'data-testid="quick-start-skip"');
    expect(skip).toMatch(/^<a /);
    expect(skip).toContain('href="/app"');
  });

  it("uses the new look only", () => {
    expect(html).not.toMatch(/t2q-|font-mono|uppercase|bg-ink-|text-white|\/\/ /);
  });

  it("units read as words", () => {
    expect(perUnit("each")).toBe("each");
    expect(perUnit("bag")).toBe("per bag");
  });
});
