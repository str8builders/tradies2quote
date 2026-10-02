/**
 * Activation: how far each person who signed up got.
 *
 * Signing up is not using the app. This follows everyone down the steps
 * (confirmed their email, set up the business, made a quote, sent one, had one
 * accepted) and names the people who stopped, so the owner can reach out to
 * them. Pure: the overview fetches the rows and passes them in, so every rule
 * here is testable without a database.
 *
 * Left out, and counted separately so the funnel isn't flattered or dragged
 * down: internal accounts (the owner, the App Review demo) and team workers
 * (people who joined someone else's team to log hours; they aren't meant to
 * quote).
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
  /** When they confirmed their email (sign-up sends a link); null until they do. */
  confirmedAt?: Date | null;
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

export type ActivationStepId = "signed-up" | "confirmed" | "business" | "quote" | "sent" | "won";

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

/** Which internal account an address is: the owner's own, or the App Review demo. */
export type InternalKind = "owner" | "review";

export interface ActivationExclusions {
  /** Internal accounts found among the sign-ups, in a fixed order (owner first). */
  internal: InternalKind[];
  /** People who joined someone else's team (they log hours; quoting isn't their job). */
  teamWorkers: number;
}

export interface ActivationSection {
  steps: ActivationStep[];
  /** People who made a quote in the last 7 days. */
  activeThisWeek: number;
  /** Median hours from signing up to the first quote, among those who made one. */
  medianHoursToFirstQuote: number | null;
  /** Signed up over a day ago and never confirmed their email, longest wait first. */
  unconfirmed: StuckPerson[];
  /** Confirmed (or signed up before confirmation was tracked) over a day ago, no quote yet, longest wait first. */
  stuckNoQuote: StuckPerson[];
  /** Made a quote over a day ago but never sent one, longest wait first. */
  quotedNotSent: StuckPerson[];
  /** Who was left out of every number above. */
  excluded: ActivationExclusions;
  error: string | null;
}

export interface ActivationInput {
  users: readonly ActivationUser[];
  profiles: readonly ActivationProfile[];
  quotes: readonly ActivationQuote[];
  /** User ids in team_members: people who joined someone else's team. */
  teamMemberIds?: ReadonlySet<string>;
  now: Date;
  /** The owner's own account, the App Review demo, or null for a customer. */
  internalKind: (email: string | null) => InternalKind | null;
}

export const EMPTY_ACTIVATION: ActivationSection = {
  steps: [],
  activeThisWeek: 0,
  medianHoursToFirstQuote: null,
  unconfirmed: [],
  stuckNoQuote: [],
  quotedNotSent: [],
  excluded: { internal: [], teamWorkers: 0 },
  error: null,
};

export const isSentQuote = (q: Pick<ActivationQuote, "status" | "sent_at">): boolean =>
  Boolean(q.sent_at) || SENT_STATUSES.has(q.status ?? "");

export const isWonQuote = (q: Pick<ActivationQuote, "status" | "accepted_at">): boolean =>
  Boolean(q.accepted_at) || WON_STATUSES.has(q.status ?? "");

/**
 * Confirmed their email. Accounts made before confirmations were tracked have
 * no date at all (undefined, not null): they could only have got in by
 * confirming, so they count as confirmed.
 */
export const isConfirmed = (u: Pick<ActivationUser, "confirmedAt">): boolean => u.confirmedAt !== null;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildActivation({ users, profiles, quotes, teamMemberIds, now, internalKind }: ActivationInput): ActivationSection {
  const internal = new Set<InternalKind>();
  let teamWorkers = 0;
  const customers: ActivationUser[] = [];
  for (const user of users) {
    const kind = internalKind(user.email);
    if (kind) internal.add(kind);
    else if (teamMemberIds?.has(user.id)) teamWorkers += 1;
    else customers.push(user);
  }
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
  let confirmedCount = 0;
  let madeQuote = 0;
  let sentQuote = 0;
  let wonQuote = 0;
  let activeThisWeek = 0;
  const hoursToFirst: number[] = [];
  const unconfirmed: StuckPerson[] = [];
  const stuckNoQuote: StuckPerson[] = [];
  const quotedNotSent: StuckPerson[] = [];

  for (const user of customers) {
    const label = user.email ?? "(no email)";
    const list = byUser.get(user.id) ?? [];
    const signedUpMs = user.createdAt.getTime();
    const confirmed = isConfirmed(user);
    if (confirmed) confirmedCount += 1;

    if (list.length === 0) {
      if (nowMs - signedUpMs >= GRACE_MS) {
        const person = { email: label, days: Math.floor((nowMs - signedUpMs) / DAY_MS), quotes: 0 };
        (confirmed ? stuckNoQuote : unconfirmed).push(person);
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
  const order: InternalKind[] = ["owner", "review"];

  return {
    steps: [
      step("signed-up", "Signed up", total),
      step("confirmed", "Confirmed their email", confirmedCount),
      step("business", "Set up their business", businessSet.size),
      step("quote", "Made a quote", madeQuote),
      step("sent", "Sent a quote", sentQuote),
      step("won", "Had a quote accepted", wonQuote),
    ],
    activeThisWeek,
    medianHoursToFirstQuote: hours === null ? null : Math.round(hours * 10) / 10,
    unconfirmed: unconfirmed.sort(longestFirst).slice(0, STUCK_LIST_LIMIT),
    stuckNoQuote: stuckNoQuote.sort(longestFirst).slice(0, STUCK_LIST_LIMIT),
    quotedNotSent: quotedNotSent.sort(longestFirst).slice(0, STUCK_LIST_LIMIT),
    excluded: { internal: order.filter((k) => internal.has(k)), teamWorkers },
    error: null,
  };
}

/** "your own account, the App Review demo account and 2 team workers" (empty when nothing was left out). */
export function excludedSentence({ internal, teamWorkers }: ActivationExclusions): string {
  const parts: string[] = [];
  if (internal.includes("owner")) parts.push("your own account");
  if (internal.includes("review")) parts.push("the App Review demo account");
  if (teamWorkers > 0) parts.push(teamWorkers === 1 ? "1 team worker" : `${teamWorkers} team workers`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
