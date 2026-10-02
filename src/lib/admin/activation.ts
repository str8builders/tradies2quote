/**
 * Activation: how far each person who signed up got.
 *
 * Signing up is not using the app. This follows everyone down five steps (set
 * up the business, made a quote, sent one, had one accepted) and names the
 * people who stopped, so the owner can reach out to them. Pure: the overview
 * fetches the rows and passes them in, so every rule here is testable without
 * a database. Internal accounts (the owner, the App Review demo) are left out
 * so they don't make the funnel look better than it is.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Someone who signed up less than this long ago isn't "stuck", just new. */
const GRACE_MS = DAY_MS;

/** How many names each "stopped here" list shows. */
export const STUCK_LIST_LIMIT = 10;

/** Quote statuses that mean it has gone out to the customer (everything after draft). */
const SENT_STATUSES = new Set(["sent", "viewed", "accepted", "declined", "expired", "scheduled", "in_progress", "completed"]);
/** Quote statuses that mean the customer said yes. */
const WON_STATUSES = new Set(["accepted", "scheduled", "in_progress", "completed"]);

export interface ActivationUser {
  id: string;
  email: string | null;
  createdAt: Date;
}

export interface ActivationProfile {
  id: string;
  business_name: string | null;
}

export interface ActivationQuote {
  user_id: string;
  status: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
}

export type ActivationStepId = "signed-up" | "business" | "quote" | "sent" | "won";

export interface ActivationStep {
  id: ActivationStepId;
  label: string;
  count: number;
  /** Share of everyone who signed up, 0 to 1. */
  share: number;
}

export interface StuckPerson {
  email: string;
  /** Whole days since they signed up (no quote yet) or since their first quote (never sent). */
  days: number;
  quotes: number;
}

export interface ActivationSection {
  steps: ActivationStep[];
  /** People who made a quote in the last 7 days. */
  activeThisWeek: number;
  /** Median hours from signing up to the first quote, among those who made one. */
  medianHoursToFirstQuote: number | null;
  /** Signed up over a day ago and never made a quote, longest wait first. */
  stuckNoQuote: StuckPerson[];
  /** Made a quote over a day ago but never sent one, longest wait first. */
  quotedNotSent: StuckPerson[];
  /** Internal accounts left out of every number above. */
  excluded: number;
  error: string | null;
}

export interface ActivationInput {
  users: readonly ActivationUser[];
  profiles: readonly ActivationProfile[];
  quotes: readonly ActivationQuote[];
  now: Date;
  /** True for accounts that aren't customers (the owner, the review demo). */
  isInternal: (email: string | null) => boolean;
}

export const EMPTY_ACTIVATION: ActivationSection = {
  steps: [],
  activeThisWeek: 0,
  medianHoursToFirstQuote: null,
  stuckNoQuote: [],
  quotedNotSent: [],
  excluded: 0,
  error: null,
};

export const isSentQuote = (q: Pick<ActivationQuote, "status" | "sent_at">): boolean =>
  Boolean(q.sent_at) || SENT_STATUSES.has(q.status ?? "");

export const isWonQuote = (q: Pick<ActivationQuote, "status" | "accepted_at">): boolean =>
  Boolean(q.accepted_at) || WON_STATUSES.has(q.status ?? "");

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildActivation({ users, profiles, quotes, now, isInternal }: ActivationInput): ActivationSection {
  const customers = users.filter((u) => !isInternal(u.email));
  const excluded = users.length - customers.length;
  const ids = new Set(customers.map((u) => u.id));

  const businessSet = new Set(profiles.filter((p) => ids.has(p.id) && p.business_name?.trim()).map((p) => p.id));

  const byUser = new Map<string, ActivationQuote[]>();
  for (const q of quotes) {
    if (!ids.has(q.user_id)) continue;
    const list = byUser.get(q.user_id);
    if (list) list.push(q);
    else byUser.set(q.user_id, [q]);
  }

  const nowMs = now.getTime();
  const weekAgo = nowMs - 7 * DAY_MS;
  let madeQuote = 0;
  let sentQuote = 0;
  let wonQuote = 0;
  let activeThisWeek = 0;
  const hoursToFirst: number[] = [];
  const stuckNoQuote: StuckPerson[] = [];
  const quotedNotSent: StuckPerson[] = [];

  for (const user of customers) {
    const label = user.email ?? "(no email)";
    const list = byUser.get(user.id) ?? [];
    const signedUpMs = user.createdAt.getTime();

    if (list.length === 0) {
      if (nowMs - signedUpMs >= GRACE_MS) {
        stuckNoQuote.push({ email: label, days: Math.floor((nowMs - signedUpMs) / DAY_MS), quotes: 0 });
      }
      continue;
    }

    madeQuote += 1;
    const created = list.map((q) => new Date(q.created_at).getTime()).filter((t) => Number.isFinite(t));
    const firstMs = created.length ? Math.min(...created) : signedUpMs;
    const lastMs = created.length ? Math.max(...created) : signedUpMs;
    hoursToFirst.push(Math.max(0, firstMs - signedUpMs) / HOUR_MS);
    if (lastMs >= weekAgo) activeThisWeek += 1;

    if (list.some(isSentQuote)) sentQuote += 1;
    else if (nowMs - firstMs >= GRACE_MS) {
      quotedNotSent.push({ email: label, days: Math.floor((nowMs - firstMs) / DAY_MS), quotes: list.length });
    }
    if (list.some(isWonQuote)) wonQuote += 1;
  }

  const total = customers.length;
  const step = (id: ActivationStepId, label: string, count: number): ActivationStep => ({
    id,
    label,
    count,
    share: total === 0 ? 0 : count / total,
  });

  const longestFirst = (a: StuckPerson, b: StuckPerson) => b.days - a.days || a.email.localeCompare(b.email);
  const hours = median(hoursToFirst);

  return {
    steps: [
      step("signed-up", "Signed up", total),
      step("business", "Set up their business", businessSet.size),
      step("quote", "Made a quote", madeQuote),
      step("sent", "Sent a quote", sentQuote),
      step("won", "Had a quote accepted", wonQuote),
    ],
    activeThisWeek,
    medianHoursToFirstQuote: hours === null ? null : Math.round(hours * 10) / 10,
    stuckNoQuote: stuckNoQuote.sort(longestFirst).slice(0, STUCK_LIST_LIMIT),
    quotedNotSent: quotedNotSent.sort(longestFirst).slice(0, STUCK_LIST_LIMIT),
    excluded,
    error: null,
  };
}
