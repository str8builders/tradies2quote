import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { tryStripe } from "@/lib/stripe-client";
import { buildConnectorCards, type ConnectorCard } from "./connectors";

/**
 * Admin overview — the single aggregate the owner Ops dashboard reads.
 *
 * Three sections:
 *   • money   — Stripe truth (revenue, subs, balance, recent payments)
 *   • growth  — our own Supabase DB truth (users, trials, the
 *               "expiring soon" running-out feed, quote volume)
 *   • connectors — per-service health + budget (see connectors.ts)
 *
 * Every external call is wrapped so one failing provider degrades its
 * own section to an `error` string and the rest of the page still
 * renders. This is an at-a-glance ops view, not a billing ledger.
 */

const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Stripe statuses that mean the user currently has paid access. */
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface RecentPayment {
  amount: number;
  currency: string;
  email: string | null;
  created: string;
  status: string;
}

export interface MoneySection {
  stripeConfigured: boolean;
  activeSubs: number;
  trialingSubs: number;
  pastDueSubs: number;
  canceledSubs: number;
  /** Estimated monthly recurring revenue from active+trialing subs. */
  mrr: number;
  currency: string;
  balanceAvailable: number | null;
  balancePending: number | null;
  recentPayments: RecentPayment[];
  error: string | null;
  /** Per-call problems (a key missing one permission) — the rest still shows. */
  warnings: string[];
}

export interface ExpiringTrial {
  email: string;
  daysLeft: number;
  trialEndsAt: string;
}

export interface GrowthSection {
  totalUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  /** Users currently inside their 7-day trial and NOT paying. */
  inTrial: number;
  /** Users who are paying (active / past_due / stripe-trialing). */
  paying: number;
  /** Trial users whose window ends within 3 days — the "running out" feed. */
  expiringSoon: ExpiringTrial[];
  quotesLast24h: number;
  quotesLast7d: number;
  error: string | null;
}

export interface AdminOverview {
  generatedAt: string;
  money: MoneySection;
  growth: GrowthSection;
  connectors: ConnectorCard[];
}

/** Pull every auth user (paginated). Founder MVP fits one page; we loop
 *  for safety so it keeps working as the base grows. */
async function listAllUsers(
  admin: ReturnType<typeof adminClient>,
): Promise<{ id: string; email: string | null; createdAt: Date }[]> {
  const out: { id: string; email: string | null; createdAt: Date }[] = [];
  let page = 1;
  const perPage = 1000;
  // Hard stop at 20 pages (20k users) so a pagination bug can't loop forever.
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at ? new Date(u.created_at) : new Date(0),
      });
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return out;
}

async function buildGrowth(now: Date): Promise<GrowthSection> {
  const empty: GrowthSection = {
    totalUsers: 0,
    newUsers7d: 0,
    newUsers30d: 0,
    inTrial: 0,
    paying: 0,
    expiringSoon: [],
    quotesLast24h: 0,
    quotesLast7d: 0,
    error: null,
  };
  try {
    const admin = adminClient();

    const [users, profileRes, subRes] = await Promise.all([
      listAllUsers(admin),
      // trial_started_at is the Wave 39 reset anchor; not in generated
      // types, so the select is cast and the rows narrowed by hand.
      admin.from("profiles").select("id, trial_started_at" as never),
      admin.from("subscriptions").select("user_id, status"),
    ]);

    const profileRows =
      (profileRes.data as unknown as
        | { id: string; trial_started_at: string | null }[]
        | null) ?? [];
    const trialAnchorById = new Map<string, string | null>();
    for (const p of profileRows) trialAnchorById.set(p.id, p.trial_started_at);

    const subRows =
      (subRes.data as { user_id: string; status: string | null }[] | null) ??
      [];
    const payingUserIds = new Set<string>();
    for (const s of subRows) {
      if (s.status && PAID_STATUSES.has(s.status)) payingUserIds.add(s.user_id);
    }

    const sevenDaysAgo = now.getTime() - 7 * DAY_MS;
    const thirtyDaysAgo = now.getTime() - 30 * DAY_MS;

    let newUsers7d = 0;
    let newUsers30d = 0;
    let inTrial = 0;
    const expiringSoon: ExpiringTrial[] = [];

    for (const u of users) {
      const created = u.createdAt.getTime();
      if (created >= sevenDaysAgo) newUsers7d += 1;
      if (created >= thirtyDaysAgo) newUsers30d += 1;

      if (payingUserIds.has(u.id)) continue; // counted as paying below

      const anchorRaw = trialAnchorById.get(u.id);
      const anchor = anchorRaw ? new Date(anchorRaw).getTime() : created;
      const trialEndsAt = anchor + TRIAL_DAYS * DAY_MS;
      const msLeft = trialEndsAt - now.getTime();
      if (msLeft > 0) {
        inTrial += 1;
        const daysLeft = Math.ceil(msLeft / DAY_MS);
        if (daysLeft <= 3 && u.email) {
          expiringSoon.push({
            email: u.email,
            daysLeft,
            trialEndsAt: new Date(trialEndsAt).toISOString(),
          });
        }
      }
    }

    expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);

    // Quote volume — rolling windows so timezone never confuses the count.
    const since24h = new Date(now.getTime() - DAY_MS).toISOString();
    const since7d = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const [q24, q7] = await Promise.all([
      admin
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", since24h),
      admin
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", since7d),
    ]);

    return {
      totalUsers: users.length,
      newUsers7d,
      newUsers30d,
      inTrial,
      paying: payingUserIds.size,
      expiringSoon,
      quotesLast24h: q24.count ?? 0,
      quotesLast7d: q7.count ?? 0,
      error: null,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "Growth metrics failed.",
    };
  }
}

async function buildMoney(): Promise<MoneySection> {
  const base: MoneySection = {
    stripeConfigured: false,
    activeSubs: 0,
    trialingSubs: 0,
    pastDueSubs: 0,
    canceledSubs: 0,
    mrr: 0,
    currency: "NZD",
    balanceAvailable: null,
    balancePending: null,
    recentPayments: [],
    error: null,
    warnings: [],
  };

  const stripe = tryStripe();
  if (!stripe) return base;
  base.stripeConfigured = true;

  // A restricted key with one permission missing used to blank the whole
  // panel with Stripe's raw error. Each call now fails on its own, and a
  // permission error says exactly which box to tick in the Stripe dashboard.
  const explain = (what: string, permission: string, err: unknown): string => {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string } | null)?.code;
    if (code === "permission_denied" || /required permissions/i.test(message)) {
      return `${what}: the Stripe key on the server can't read this. In Stripe → Developers → API keys, edit the restricted key, enable ${permission}, then update STRIPE_SECRET_KEY on the server and restart.`;
    }
    return `${what}: ${message}`;
  };

  try {
    const subs = await stripe.subscriptions.list({ status: "all", limit: 100 });
    let mrrCents = 0;
    let currency = "nzd";
    for (const sub of subs.data) {
      if (sub.status === "active") base.activeSubs += 1;
      else if (sub.status === "trialing") base.trialingSubs += 1;
      else if (sub.status === "past_due") base.pastDueSubs += 1;
      else if (sub.status === "canceled") base.canceledSubs += 1;

      if (sub.status === "active" || sub.status === "trialing") {
        for (const item of sub.items.data) {
          const unit = item.price.unit_amount ?? 0;
          mrrCents += unit * (item.quantity ?? 1);
          if (item.price.currency) currency = item.price.currency;
        }
      }
    }
    base.mrr = mrrCents / 100;
    base.currency = currency.toUpperCase();
  } catch (err) {
    base.warnings.push(explain("Subscriptions", "Subscriptions: Read", err));
  }

  try {
    const balance = await stripe.balance.retrieve();
    const pick = (rows: { amount: number; currency: string }[]) => {
      if (!rows.length) return null;
      const match =
        rows.find((r) => r.currency.toUpperCase() === base.currency) ?? rows[0];
      return match.amount / 100;
    };
    base.balanceAvailable = pick(balance.available);
    base.balancePending = pick(balance.pending);
  } catch (err) {
    base.warnings.push(explain("Balance", "Balance: Read", err));
  }

  try {
    const charges = await stripe.charges.list({ limit: 5 });
    base.recentPayments = charges.data.map((c) => ({
      amount: c.amount / 100,
      currency: c.currency.toUpperCase(),
      email: c.billing_details?.email ?? c.receipt_email ?? null,
      created: new Date(c.created * 1000).toISOString(),
      status: c.status,
    }));
  } catch (err) {
    base.warnings.push(explain("Recent payments", "Charges: Read", err));
  }

  // Only a total outage (every call failed) is an error; anything else is a warning beside real numbers.
  if (base.warnings.length === 3) return { ...base, error: base.warnings[0] };
  return base;
}

/** Build the whole overview. All three sections run in parallel. */
export async function buildAdminOverview(): Promise<AdminOverview> {
  const now = new Date();
  const [money, growth, connectors] = await Promise.all([
    buildMoney(),
    buildGrowth(now),
    buildConnectorCards(),
  ]);
  return {
    generatedAt: now.toISOString(),
    money,
    growth,
    connectors,
  };
}
