// /app/materials (the classic look): the "price saved" banner's explicit
// signal (never guessed from the referer), the library read past 1,000 rows,
// and the Kits teaser's honest wording.
//
// MaterialsBody / CaptureSuccessBanner are exported specifically so this
// test can render them directly — the page's own tree wraps MaterialsBody
// in a <Suspense>, which renderToStaticMarkup can't resolve synchronously.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  db: null as { ops: FakeOp[] } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => env.respond(op));
    env.db = db;
    return { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) }, from: db.from };
  },
}));
vi.mock("./_components/ScanBarcodeButton", () => ({ ScanBarcodeButton: () => null }));

import MaterialsPage, { CaptureSuccessBanner, MaterialsBody } from "./page";

const ROWS = [
  { id: "m1", name: "GIB Standard 10mm", unit: "sheet", default_unit_price: 24.5, supplier: "Mitre 10", supplier_url: null, notes: null, usage_count: 5, is_ai_estimated: false, last_used_at: null },
];

function script({ materials = ROWS as unknown[], currency = "NZD" } = {}) {
  env.respond = (op) => {
    if (op.table === "materials") return { data: materials };
    if (op.table === "profiles") return { data: { currency } };
    return undefined;
  };
}

async function body(): Promise<string> {
  return renderToStaticMarkup((await MaterialsBody({ userId: "user-1" })) as ReactElement);
}

/** Every element in a tree matching `match` (mirrors switch.test.tsx's helper). */
function findAll(node: unknown, match: (el: ReactElement<Record<string, unknown>>) => boolean) {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (match(element)) found.push(element);
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

beforeEach(() => {
  env.db = null;
  script();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/app/materials (classic) — the capture-success banner", () => {
  it("shows only on the explicit signal, never guessed from the referer", () => {
    expect(renderToStaticMarkup(createElement(CaptureSuccessBanner, { captured: true }))).toContain(
      "Material added",
    );
    // Cancel and a save both leave the SAME /app/materials/capture page, so
    // a referer-based guess could never tell the two apart — this is
    // exactly the case that used to falsely show the banner.
    expect(renderToStaticMarkup(createElement(CaptureSuccessBanner, { captured: false }))).toBe("");
  });

  it("MaterialsPage passes the ?captured=1 query straight through, nothing else", async () => {
    const tree = (await MaterialsPage({
      searchParams: Promise.resolve({ captured: "1" }),
    })) as ReactElement;
    expect(findAll(tree, (el) => el.type === CaptureSuccessBanner)[0]?.props.captured).toBe(true);

    const off = (await MaterialsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(findAll(off, (el) => el.type === CaptureSuccessBanner)[0]?.props.captured).toBe(false);
  });
});

describe("/app/materials (classic) — reads the whole library", () => {
  it("reads past 1,000 rows instead of silently truncating", async () => {
    const big = Array.from({ length: 1200 }, (_, i) => ({
      id: `m-${i}`,
      name: `Item ${i}`,
      unit: "each",
      default_unit_price: 5,
      supplier: null,
      supplier_url: null,
      notes: null,
      usage_count: 0,
      is_ai_estimated: false,
      last_used_at: null,
    }));
    let reads = 0;
    env.respond = (op) => {
      if (op.table === "materials") {
        reads += 1;
        return { data: reads === 1 ? big.slice(0, 1000) : big.slice(1000) };
      }
      if (op.table === "profiles") return { data: { currency: "NZD" } };
      return undefined;
    };
    const html = await body();
    expect(reads).toBe(2);
    expect(html).toContain("1200 items saved");
  });

  it("a read failure shows an empty library rather than crashing the page", async () => {
    env.respond = (op) => {
      if (op.table === "materials") return { error: { message: "boom" } };
      if (op.table === "profiles") return { data: { currency: "NZD" } };
      return undefined;
    };
    const html = await body();
    expect(html).toContain("0 items saved");
  });
});

describe("/app/materials (classic) — Kits teaser wording", () => {
  it("points at the job page's Add a kit instead of claiming a one-tap add from here", async () => {
    vi.stubEnv("KITS_ENABLED", "true");
    const tree = (await MaterialsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const kitsLink = findAll(tree, (el) => el.props.href === "/app/materials/kits")[0];
    expect(kitsLink).toBeTruthy();
    const html = renderToStaticMarkup(kitsLink);
    expect(html).toContain("Add a kit");
    expect(html).not.toContain("in one tap");
  });
});
