// Old-look /app/settings when the profile can't be read (audit 2026-09-28):
// the page used to ignore the failed read and render the form with blanks
// and defaults, and Save (which sends every field) then wiped the business
// name, address, GST number and bank details.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  user: { id: "user-1", email: "mike@bayside.co.nz", created_at: "2026-09-01T00:00:00Z" },
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  throwOnProfile: false,
}));

vi.mock("@/lib/ui/newLook", () => ({
  isNewLookOn: async () => false,
  getNewLookState: async () => ({ on: false, choice: null, envDefault: "off", canChoose: false }),
}));
vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: env.user }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => env.respond(op));
    return {
      auth: { getUser: async () => ({ data: { user: env.user } }) },
      from: (table: string) => {
        if (table === "profiles" && env.throwOnProfile) {
          const failing = {
            select: () => failing,
            eq: () => failing,
            maybeSingle: () => Promise.reject(new Error("fetch failed")),
          };
          return failing;
        }
        return db.from(table);
      },
    };
  },
}));
vi.mock("@/lib/team", () => ({ getTeamContext: async (id: string) => ({ clientOwnerId: id }) }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => false }));
vi.mock("@/lib/subscription", () => ({
  getCachedSubscriptionStatus: async () => ({
    state: "trialing",
    plan: null,
    trialEndsAt: new Date("2026-10-02T12:00:00Z"),
    trialDaysLeft: 5,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionStatus: null,
    betaFreeUntil: null,
  }),
}));
vi.mock("@/lib/stripe-client", () => ({ isStripeConfigured: () => true }));
vi.mock("@/lib/payments", () => ({ paymentsEnabled: () => false, getConnectStatus: vi.fn(), refreshConnectStatus: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));

import SettingsPage from "./page";
import { SettingsForm } from "./_components/SettingsForm";
import { BusinessLogoField } from "./_components/BusinessLogoField";
import { QuoteRequestLinkCard } from "./_components/QuoteRequestLinkCard";

function findAll(node: unknown, type: unknown): ReactElement[] {
  const found: ReactElement[] = [];
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

const page = () => SettingsPage({ searchParams: Promise.resolve({}) });

/** Render the page's own element (its child components are plain functions). */
function markup(tree: unknown): string {
  const element = tree as ReactElement;
  const Component = element.type as () => ReactElement;
  return renderToStaticMarkup(typeof Component === "function" ? Component() : element);
}

beforeEach(() => {
  env.throwOnProfile = false;
  env.respond = (op) => {
    if (op.table === "profiles") return { data: { business_name: "Bayside Builders", email: "office@bayside.co.nz" } };
    if (op.table === "clients") return { data: [] };
    return undefined;
  };
});

describe("old-look settings: a failed profile read", () => {
  it("shows a retry and no form that could save blanks", async () => {
    env.respond = (op) => (op.table === "profiles" ? { error: { message: "timeout" } } : { data: [] });
    const tree = await page();
    expect(findAll(tree, SettingsForm)).toHaveLength(0);
    expect(findAll(tree, BusinessLogoField)).toHaveLength(0);
    expect(findAll(tree, QuoteRequestLinkCard)).toHaveLength(0);
    const html = markup(tree);
    expect(html).toContain('data-testid="settings-load-failed"');
    expect(html).toContain("Nothing has been changed.");
    expect(html).toContain('href="/app/settings"');
  });

  it("a read that throws is treated the same", async () => {
    env.throwOnProfile = true;
    const tree = await page();
    expect(findAll(tree, SettingsForm)).toHaveLength(0);
    expect(markup(tree)).toContain("Couldn’t load your settings.");
  });

  it("a loaded profile (or a brand-new account with no row) still gets the form", async () => {
    expect(findAll(await page(), SettingsForm)).toHaveLength(1);
    env.respond = (op) => (op.table === "profiles" ? { data: null } : { data: [] });
    expect(findAll(await page(), SettingsForm)).toHaveLength(1);
  });
});
