// /app/requests: the new-look switch, and both looks rendered to static HTML
// in node from the same scripted database. Off: the old page, unchanged. On:
// the new look's cards, with the same statuses and actions.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  on: false,
  native: false,
  rows: [] as Array<Record<string, unknown>>,
  quotes: [] as Array<Record<string, unknown>>,
  ops: [] as FakeOp[],
}));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
vi.mock("@/lib/supabase/auth", () => ({
  getCachedAuthUser: async () => ({ user: { id: "user-1", email: "t@example.invalid" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => {
      if (op.table === "quote_requests" && op.action === "select") return { data: env.rows };
      if (op.table === "quotes") return { data: env.quotes };
      return undefined;
    });
    env.ops = db.ops;
    return { from: db.from };
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("./actions", () => ({ setQuoteRequestDismissed: vi.fn() }));

import RequestsPage from "./page";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { Screen } from "@/components/ui/screen";
import { RequestsView } from "./_newlook/RequestsView";

const LONG_AGO = "2026-01-01T00:00:00Z";

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

const page = (show?: string) => RequestsPage({ searchParams: Promise.resolve(show ? { show } : {}) });

beforeEach(() => {
  env.on = false;
  env.native = false;
  env.rows = [
    {
      id: "r1",
      quote_id: "q1",
      client_name: "Aroha Smith",
      client_email: "aroha@example.nz",
      client_phone: "021 555 0101",
      site_address: "12 Rata St",
      description: "New deck, about 20 m²",
      status: "generated",
      error_message: null,
      created_at: LONG_AGO,
      seen_at: null,
    },
    {
      id: "r2",
      quote_id: "q2",
      client_name: "Ben Tait",
      client_email: null,
      client_phone: null,
      site_address: null,
      description: "Fix a fence",
      status: "generation_failed",
      error_message: "Subscription inactive: upgrade to keep quoting",
      created_at: LONG_AGO,
      seen_at: LONG_AGO,
    },
  ];
  env.quotes = [
    { id: "q1", quote_data: { line_items: [] }, status: "draft" },
    { id: "q2", quote_data: {}, status: "draft" },
  ];
});

describe("/app/requests with the new look off", () => {
  it("is the old page, unchanged", async () => {
    const tree = (await page()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, AppHeader).map((el) => el.props.context)).toEqual(["Quote requests"]);
    expect(findAll(tree, RequestsView)).toHaveLength(0);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("// from your request link");
    expect(html).toContain("t2q-card-pro");
    expect(html).toContain("Draft ready to review");
    expect(html).toContain("Needs you to generate");
    expect(html).toContain("021 555 0101 · aroha@example.nz · 12 Rata St");
    expect(html).toContain('data-testid="request-generate"');
    expect(html).toContain("Subscription inactive: upgrade to keep quoting");
  });
});

describe("/app/requests with the new look on", () => {
  beforeEach(() => {
    env.on = true;
  });

  it("is the new look's cards under the shared top bar", async () => {
    const tree = (await page()) as ReactElement;
    expect(tree.type).toBe(Screen);
    expect(findAll(tree, AppHeader).map((el) => el.props.context)).toEqual(["Quote requests"]);
    const [view] = findAll(tree, RequestsView);
    expect(view.props.showDismissed).toBe(false);
    expect((view.props.items as Array<{ id: string }>).map((item) => item.id)).toEqual(["r1", "r2"]);
  });

  it("still marks the opened requests as seen", async () => {
    await page();
    const update = env.ops.find((op) => op.table === "quote_requests" && op.action === "update");
    expect(update?.filters).toContainEqual(["in", "id", ["r1"]]);
    expect(update?.filters).toContainEqual(["eq", "user_id", "user-1"]);
  });

  it("shows each request's status in words and the same actions", async () => {
    const html = renderToStaticMarkup((await page()) as ReactElement);
    expect(html).toContain("Aroha Smith");
    expect(html).toContain("Draft ready to review");
    expect(html).toContain('data-tone="ok"');
    expect(html).toContain("Needs you to generate");
    expect(html).toContain('data-testid="request-generate"');
    expect(html).toContain('href="/app/quotes/preview/q1"');
    expect(html).toContain("Open draft quote");
    expect(html).toContain('data-testid="request-dismiss"');
    expect(html).toContain("No contact details");
    expect(html).toContain('data-unseen="true"');
    expect(html).toContain(">New<");
    expect(html).toContain('href="/app/requests?show=dismissed"');
    expect(html).not.toMatch(/t2q-|font-mono|uppercase|\/\/ /);
  });

  it("the iPhone app shows a saved note in plain words (3.1.3(f))", async () => {
    env.native = true;
    const html = renderToStaticMarkup((await page()) as ReactElement);
    expect(html).toContain("New quotes are paused on this account.");
    expect(html).not.toMatch(/subscri|upgrade/i);
  });

  it("with nothing to show: a way to set up the request link", async () => {
    env.rows = [];
    const html = renderToStaticMarkup((await page()) as ReactElement);
    expect(html).toContain("No requests yet");
    expect(html).toContain('href="/app/settings/rates"');

    const dismissed = renderToStaticMarkup((await page("dismissed")) as ReactElement);
    expect(dismissed).toContain("No dismissed requests");
    expect(dismissed).toContain('href="/app/requests"');
    expect(dismissed).toContain("Back to open requests");
  });

  it("a dismissed request offers Restore", async () => {
    env.rows = [{ ...env.rows[0], status: "dismissed" }];
    const html = renderToStaticMarkup((await page("dismissed")) as ReactElement);
    expect(html).toContain('data-testid="request-restore"');
    expect(html).toContain(">Restore<");
  });
});
