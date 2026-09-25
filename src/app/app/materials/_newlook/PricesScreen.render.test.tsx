// "Your prices" (new look), rendered to static HTML in node: the actions,
// the empty state, the list rows, and the failure state.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  referer: null as string | null,
  db: null as { ops: FakeOp[] } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => env.respond(op));
    env.db = db;
    return { from: db.from };
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(env.referer ? { referer: env.referer } : {}),
}));
// The real button lazy-loads the camera sheet; its first render is only the button.
vi.mock("../_components/ScanBarcodeButton", () => ({
  ScanBarcodeButton: (props: { mode: string; currency: string; library?: unknown[]; className?: string }) =>
    createElement(
      "button",
      {
        type: "button",
        "data-testid": "scan-barcode-button",
        "data-mode": props.mode,
        "data-currency": props.currency,
        "data-library": String(props.library?.length ?? 0),
        className: props.className,
      },
      "Scan barcode",
    ),
}));

import { PricesList } from "./PricesList";
import { TOP_BAR_FIXTURE } from "../../_v2/lib/fixtures";
import { PRICES_EXPLAINER, PricesBody, PricesScreen } from "./PricesScreen";
import { toPriceRow } from "./prices-model";

const ROWS = [
  { id: "m1", name: "GIB Standard 10mm", unit: "sheet", default_unit_price: 24.5, supplier: "Mitre 10", supplier_url: null, notes: null, usage_count: 5, is_ai_estimated: false, last_used_at: null },
  { id: "m2", name: "Joist hanger 190mm", unit: "each", default_unit_price: null, supplier: null, supplier_url: null, notes: null, usage_count: 0, is_ai_estimated: false, last_used_at: null },
];

function script({ materials = ROWS, error = null as unknown, currency = "NZD" } = {}) {
  env.respond = (op) => {
    if (op.table === "materials") return error ? { error } : { data: materials };
    if (op.table === "profiles") return { data: { currency } };
    return undefined;
  };
}

async function body(): Promise<string> {
  return renderToStaticMarkup((await PricesBody({ userId: "user-1" })) as ReactElement);
}

/** The opening tag of the element that holds a piece of text or attribute. */
const tagWith = (html: string, fragment: string) => {
  const at = html.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
};

beforeEach(() => {
  env.referer = null;
  env.db = null;
  script();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Your prices", () => {
  it("has the title and the one-line explainer", () => {
    const html = renderToStaticMarkup(<PricesScreen userId="user-1" bar={TOP_BAR_FIXTURE} />);
    expect(html).toContain("Your prices");
    expect(html).toContain(PRICES_EXPLAINER.replace("'", "&#x27;"));
    expect(html).toContain('data-testid="prices-screen"');
  });

  it("reads only the signed-in tradie's materials, most used first", async () => {
    await body();
    const read = env.db!.ops.find((op) => op.table === "materials")!;
    expect(read.filters).toEqual([["eq", "user_id", "user-1"]]);
    expect(env.db!.ops.every((op) => op.action === "select")).toBe(true);
  });

  it("big actions: add a price (the orange one), scan barcode, supplier quote, price list, quick start", async () => {
    const html = await body();
    expect(tagWith(html, 'href="/app/materials/new"')).toContain("bg-ui-brand");
    expect(html).toContain(">Add a price<");
    const scan = tagWith(html, 'data-testid="scan-barcode-button"');
    expect(scan).toContain('data-mode="library"');
    expect(scan).toContain('data-library="2"');
    expect(scan).toContain("min-h-12");
    expect(html).toContain('href="/app/materials/import-quote"');
    expect(html).toContain(">Scan a supplier quote<");
    expect(html).toContain('href="/app/materials/import"');
    expect(html).toContain(">Import a price list<");
    expect(html).toContain('href="/app/materials/quick-start"');
    expect(html).not.toContain("No prices yet");
  });

  it("lists each price with its unit, and marks the ones with no price yet", async () => {
    const html = await body();
    expect(html).toContain('href="/app/materials/m1/edit"');
    expect(html).toContain("GIB Standard 10mm");
    expect(html).toContain("per sheet · Mitre 10");
    expect(html).toContain("$24.50");
    expect(html).toContain('href="/app/materials/m2/edit"');
    expect(html).toContain("No price yet");
    expect(html).toContain("2 items saved · 1 with no price yet");
    expect(html).toContain("Search your prices");
  });

  it("an empty library points to Quick start", async () => {
    script({ materials: [] });
    const html = await body();
    expect(html).toContain("No prices yet");
    expect(tagWith(html, 'href="/app/materials/quick-start"')).toContain("bg-ui-brand");
    expect(tagWith(html, 'href="/app/materials/new"')).not.toContain("bg-ui-brand");
    expect(html).not.toContain('data-testid="prices-list"');
  });

  it("a failed read says so instead of showing an empty library", async () => {
    script({ error: { message: "boom" } });
    const html = await body();
    expect(html).toContain("Couldn&#x27;t load your prices");
    expect(html).not.toContain("No prices yet");
    expect(html).not.toContain("Add a price");
  });

  it("prices show in the tradie's currency", async () => {
    script({ currency: "GBP" });
    const html = await body();
    expect(html).toContain("£24.50");
    expect(tagWith(html, 'data-testid="scan-barcode-button"')).toContain('data-currency="GBP"');
  });

  it("says the price was saved straight after supplier capture", async () => {
    env.referer = "https://tradies2quote.com/app/materials/capture";
    expect(await body()).toContain("Price saved");
    env.referer = "https://tradies2quote.com/app";
    expect(await body()).not.toContain("Price saved");
  });

  it("kits show up only when switched on", async () => {
    expect(await body()).not.toContain('href="/app/materials/kits"');
    vi.stubEnv("KITS_ENABLED", "true");
    expect(await body()).toContain('href="/app/materials/kits"');
  });
});

describe("PricesList", () => {
  it("rows are 64 px+ links with the price on the right", () => {
    const rows = ROWS.map((r) => toPriceRow({ ...r, usage_count: 0, is_ai_estimated: false }));
    const html = renderToStaticMarkup(<PricesList rows={rows} currency="NZD" />);
    expect(tagWith(html, 'href="/app/materials/m1/edit"')).toContain("min-h-16");
    expect(html).toMatch(/data-amount="24.5"[^>]*>\$24\.50</);
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Your prices"');
  });
});
