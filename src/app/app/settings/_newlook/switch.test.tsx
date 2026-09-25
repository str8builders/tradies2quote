// The new-look switch on the settings routes. Pages are called as plain
// async functions and their returned element trees inspected, so nothing
// below the page runs: with the switch off, /app/settings must return the
// old page's tree exactly as before, and the new routes hand over to it.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  on: false,
  canChoose: false,
  native: false,
  outdoorCookie: undefined as string | undefined,
  user: { id: "user-1", email: "mike@bayside.co.nz", created_at: "2026-09-01T00:00:00Z" } as {
    id: string;
    email: string | null;
    created_at?: string;
  } | null,
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  ops: [] as FakeOp[],
}));

vi.mock("@/lib/ui/newLook", () => ({
  isNewLookOn: async () => env.on,
  getNewLookState: async () => ({ on: env.on, choice: null, envDefault: "off", canChoose: env.canChoose }),
}));
vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: env.user }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => {
      env.ops.push(op);
      return env.respond(op);
    });
    return { auth: { getUser: async () => ({ data: { user: env.user } }) }, from: db.from };
  },
}));
vi.mock("@/lib/supabase/profile", () => ({
  getCachedAvatarUrl: async () => null,
  getCachedTopBarProfile: async () => ({
    firstName: "Mike",
    businessName: null,
    avatarUrl: null,
    country: "NZ",
    currency: "NZD",
  }),
}));
vi.mock("@/lib/team", () => ({ getTeamContext: async (id: string) => ({ clientOwnerId: id }) }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
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
vi.mock("@/lib/payments", () => ({
  paymentsEnabled: () => false,
  getConnectStatus: vi.fn(),
  refreshConnectStatus: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "t2q-outdoor" && env.outdoorCookie ? { value: env.outdoorCookie } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
// The old page's desktop header pulls in the whole app shell; it is never
// rendered here, only found in the tree.
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));

import SettingsPage from "../page";
import AccountSettingsPage from "../account/page";
import { FirstNameField } from "./FirstNameField";
import BusinessSettingsPage from "../business/page";
import PaymentsSettingsPage from "../payments/page";
import RatesSettingsPage from "../rates/page";
import { BusinessLogoField } from "../_components/BusinessLogoField";
import { DeleteAccountSection } from "../_components/DeleteAccountSection";
import { NewLookSetting } from "../_components/NewLookSetting";
import { QuoteRequestLinkCard } from "../_components/QuoteRequestLinkCard";
import { SettingsForm } from "../_components/SettingsForm";
import { SubscriptionPanel } from "../_components/SubscriptionPanel";
import { AiConsentCard } from "./AiConsentCard";
import { BusinessForm } from "./BusinessForm";
import { DeleteAccountCard } from "./DeleteAccountCard";
import { LoadFailed } from "./LoadFailed";
import { toSettingsValues } from "./model";
import { OutdoorSetting } from "./OutdoorSetting";
import { PaymentsForm } from "./PaymentsForm";
import { PlanCard } from "./PlanCard";
import { RatesForm } from "./RatesForm";
import { SettingsHub } from "./SettingsHub";
import { SettingsHubPage } from "./SettingsHubPage";

const PROFILE = {
  business_name: "Bayside Builders",
  email: "office@bayside.co.nz",
  phone: "021 555 0101",
  address: "12 Rata St",
  gst_number: "123-456-789",
  payment_instructions: "Bank: 12-3456",
  country: "NZ",
  currency: "NZD",
  tax_label: null,
  tax_rate: 15,
  default_labour_rate: 85,
  default_markup_pct: 20,
  logo_url: null,
  ai_consent_at: null,
  request_slug: "bayside-builders",
};

/** Every element of `type` in a returned tree (children and element props). */
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

const params = (value: { stripe?: string } = {}) => Promise.resolve(value);

beforeEach(() => {
  env.on = false;
  env.canChoose = false;
  env.native = false;
  env.outdoorCookie = undefined;
  env.user = { id: "user-1", email: "mike@bayside.co.nz", created_at: "2026-09-01T00:00:00Z" };
  env.ops = [];
  env.respond = (op) => {
    if (op.table === "profiles") return { data: PROFILE };
    if (op.table === "clients") return { data: [] };
    return undefined;
  };
});

describe("/app/settings with the new look off", () => {
  it("is the old single page, unchanged", async () => {
    const tree = await SettingsPage({ searchParams: params() });
    expect(findAll(tree, SettingsHubPage)).toHaveLength(0);
    expect((tree as ReactElement<{ className: string }>).props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, SettingsForm)).toHaveLength(1);
    expect(findAll(tree, BusinessLogoField)).toHaveLength(1);
    expect(findAll(tree, QuoteRequestLinkCard)).toHaveLength(1);
    expect(findAll(tree, SubscriptionPanel)).toHaveLength(1);
    expect(findAll(tree, DeleteAccountSection)).toHaveLength(1);
    expect(findAll(tree, NewLookSetting)).toHaveLength(0);
  });

  it("the new pages load the very values the old form starts with", async () => {
    const tree = await SettingsPage({ searchParams: params() });
    const { tax_label: _label, ...oldInitial } = findAll(tree, SettingsForm)[0].props.initial as Record<string, string>;
    expect(oldInitial).toEqual(toSettingsValues(PROFILE, env.user!.email));

    env.respond = (op) => (op.table === "profiles" ? { data: null } : { data: [] });
    const fresh = await SettingsPage({ searchParams: params() });
    const { tax_label: _fresh, ...freshInitial } = findAll(fresh, SettingsForm)[0].props.initial as Record<string, string>;
    expect(freshInitial).toEqual(toSettingsValues(null, env.user!.email));
  });

  it("the owner still gets the preview switch on the old page", async () => {
    env.canChoose = true;
    expect(findAll(await SettingsPage({ searchParams: params() }), NewLookSetting)).toHaveLength(1);
  });

  it("each new page hands over to the old page at the matching spot", async () => {
    await expect(BusinessSettingsPage()).rejects.toThrow("NEXT_REDIRECT /app/settings#business");
    await expect(RatesSettingsPage()).rejects.toThrow("NEXT_REDIRECT /app/settings#defaults");
    await expect(PaymentsSettingsPage({ searchParams: params() })).rejects.toThrow(
      "NEXT_REDIRECT /app/settings#payment_instructions",
    );
    await expect(PaymentsSettingsPage({ searchParams: params({ stripe: "return" }) })).rejects.toThrow(
      "NEXT_REDIRECT /app/settings?stripe=return",
    );
    await expect(AccountSettingsPage()).rejects.toThrow("NEXT_REDIRECT /app/settings");
  });
});

describe("/app/settings with the new look on", () => {
  beforeEach(() => {
    env.on = true;
  });

  it("is the hub, and the old page's reads never run", async () => {
    const promise = params();
    const tree = (await SettingsPage({ searchParams: promise })) as ReactElement<{ searchParams: unknown }>;
    expect(tree.type).toBe(SettingsHubPage);
    expect(tree.props.searchParams).toBe(promise);
    expect(env.ops).toHaveLength(0);
  });

  it("the hub lists the four pages; Stripe's return goes on to Payments", async () => {
    const hub = await SettingsHubPage({ searchParams: params() });
    const items = findAll(hub, SettingsHub)[0].props.items as Array<{ href: string; subtitle: string }>;
    expect(items.map((i) => i.href)).toEqual([
      "/app/settings/business",
      "/app/settings/rates",
      "/app/settings/payments",
      "/app/settings/account",
    ]);
    await expect(SettingsHubPage({ searchParams: params({ stripe: "return" }) })).rejects.toThrow(
      "NEXT_REDIRECT /app/settings/payments?stripe=return",
    );
  });

  it("signed out: to the login page", async () => {
    env.user = null;
    await expect(SettingsHubPage({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT /login");
    await expect(BusinessSettingsPage()).rejects.toThrow("NEXT_REDIRECT /login");
    await expect(AccountSettingsPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("business and rates start from the loaded profile", async () => {
    const business = findAll(await BusinessSettingsPage(), BusinessForm)[0];
    expect(business.props.initial).toEqual(toSettingsValues(PROFILE, env.user!.email));
    expect(business.props.loadedTaxLabel).toBe("GST");
    const rates = findAll(await RatesSettingsPage(), RatesForm)[0];
    expect(rates.props.initial).toEqual(toSettingsValues(PROFILE, env.user!.email));
    expect(rates.props.engagement).toBeNull();
  });

  it("a failed profile read shows a retry, never a form that could save blanks", async () => {
    env.respond = (op) => (op.table === "profiles" ? { error: { message: "timeout" } } : undefined);
    const business = await BusinessSettingsPage();
    expect(findAll(business, BusinessForm)).toHaveLength(0);
    expect(findAll(business, LoadFailed)).toHaveLength(1);
    expect(findAll(await RatesSettingsPage(), RatesForm)).toHaveLength(0);
    expect(findAll(await PaymentsSettingsPage({ searchParams: params() }), PaymentsForm)).toHaveLength(0);
  });

  it("payments: the plan is in the page on the web, and withheld inside the iOS app", async () => {
    const web = findAll(await PaymentsSettingsPage({ searchParams: params() }), PaymentsForm)[0];
    expect(web.props.cardPayments).toBeNull();
    expect(findAll(web, PlanCard)).toHaveLength(1);

    env.native = true;
    const ios = findAll(await PaymentsSettingsPage({ searchParams: params() }), PaymentsForm)[0];
    expect(ios.props.plan).toBeNull();
    expect(findAll(ios, PlanCard)).toHaveLength(0);
  });

  it("account: outdoor mode from this device's cookie, AI consent only in the iOS app, owner switch", async () => {
    env.outdoorCookie = "1";
    const web = await AccountSettingsPage();
    expect(findAll(web, OutdoorSetting)[0].props.initialOn).toBe(true);
    expect(findAll(web, AiConsentCard)).toHaveLength(0);
    expect(findAll(web, NewLookSetting)).toHaveLength(0);
    expect(findAll(web, DeleteAccountCard)).toHaveLength(1);
    expect(findAll(web, FirstNameField)[0].props.initial).toBe("Mike");

    env.native = true;
    env.canChoose = true;
    env.outdoorCookie = undefined;
    const ios = await AccountSettingsPage();
    expect(findAll(ios, OutdoorSetting)[0].props.initialOn).toBe(false);
    expect(findAll(ios, AiConsentCard)).toHaveLength(1);
    expect(findAll(ios, NewLookSetting)).toHaveLength(1);
  });
});
