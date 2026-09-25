import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { captureError } from "@/lib/observability";

/**
 * Quote-generation lease: ONE model run per quote at a time.
 *
 * Without it, a double tap, a second tab or a revisit while the quote was
 * being written ran the model twice (two bills; the last writer won). The
 * lease lives in `quotes.generation_started_at`
 * (supabase/migrations/20260926_quote_generation_lease.sql):
 *
 *   claim   — a conditional update that only matches when the quote has no
 *             quote_data and no live lease. Postgres row locking makes it
 *             atomic: of two racing requests exactly one matches.
 *   busy    — a second request while the lease is live gets a plain
 *             "already writing this quote" status (409 + code) to wait on.
 *   refresh — the worker re-stamps the lease every minute while it runs
 *             (the self-hosted model can take 5–15 minutes), so only a dead
 *             worker's lease goes stale.
 *   clear   — in the same update that saves the quote, or on failure.
 *
 * Fails OPEN: if the lease can't be read or written (column not migrated
 * yet, a DB blip) generation runs unlocked, exactly as before, and the error
 * is reported — the lease saves money, it must never block a quote.
 */

export const GENERATION_LEASE_MS = 4 * 60_000;
export const GENERATION_LEASE_HEARTBEAT_MS = 60_000;
/** How long a waiting client pauses before asking again. */
export const GENERATION_BUSY_RETRY_AFTER_S = 10;
export const GENERATION_IN_PROGRESS_CODE = "generation_in_progress";
export const GENERATION_IN_PROGRESS_MESSAGE =
  "We're already writing this quote. It will open here as soon as it's ready.";

export interface GenerationLease {
  quoteId: string;
  userId: string;
  /** The value we wrote; every later write is conditional on it. */
  stamp: string;
}

export type LeaseClaim =
  | { kind: "claimed"; lease: GenerationLease }
  | { kind: "busy"; startedAt: string }
  | { kind: "generated" }
  /** No lease possible — run unlocked (fail open). */
  | { kind: "unavailable"; reason: string };

type Db = SupabaseClient<Database>;

function isGeneratedPayload(quoteData: unknown): boolean {
  return (
    !!quoteData &&
    typeof quoteData === "object" &&
    Array.isArray((quoteData as { line_items?: unknown }).line_items)
  );
}

function unavailable(reason: string, report: boolean): LeaseClaim {
  console.warn(`[generation-lease] running unlocked: ${reason}`);
  if (report) {
    captureError(new Error(`Quote generation lease unavailable: ${reason}`), {
      route: "quotes/generate:lease",
    });
  }
  return { kind: "unavailable", reason };
}

/** The 409 body a busy claim answers with. */
export function generationInProgressBody(): Record<string, unknown> {
  return {
    error: GENERATION_IN_PROGRESS_MESSAGE,
    code: GENERATION_IN_PROGRESS_CODE,
    retry_after_s: GENERATION_BUSY_RETRY_AFTER_S,
  };
}

export async function claimGenerationLease(
  db: Db,
  ids: { quoteId: string; userId: string },
  now: () => number = Date.now,
): Promise<LeaseClaim> {
  const at = now();
  const stamp = new Date(at).toISOString();
  const staleBefore = new Date(at - GENERATION_LEASE_MS).toISOString();
  try {
    // 1. Nobody holds it.
    const free = await db
      .from("quotes")
      .update({ generation_started_at: stamp })
      .eq("id", ids.quoteId)
      .eq("user_id", ids.userId)
      .is("quote_data", null)
      .is("generation_started_at", null)
      .select("id");
    if (free.error) return unavailable(free.error.message, true);
    // With `select`, PostgREST always answers with an array of rows.
    if (!Array.isArray(free.data)) return unavailable("no row list from the claim", false);
    if (free.data.length > 0) return { kind: "claimed", lease: { ...ids, stamp } };

    // 2. The holder died: its lease is older than GENERATION_LEASE_MS.
    const stale = await db
      .from("quotes")
      .update({ generation_started_at: stamp })
      .eq("id", ids.quoteId)
      .eq("user_id", ids.userId)
      .is("quote_data", null)
      .lt("generation_started_at", staleBefore)
      .select("id");
    if (stale.error) return unavailable(stale.error.message, true);
    if (Array.isArray(stale.data) && stale.data.length > 0) {
      return { kind: "claimed", lease: { ...ids, stamp } };
    }

    // 3. Neither matched — find out why.
    const { data: row, error } = await db
      .from("quotes")
      .select("quote_data, generation_started_at")
      .eq("id", ids.quoteId)
      .eq("user_id", ids.userId)
      .maybeSingle();
    if (error || !row) return unavailable(error?.message ?? "quote not found", !!error);
    if (isGeneratedPayload(row.quote_data)) return { kind: "generated" };
    const started = row.generation_started_at;
    if (started && Date.parse(started) > at - GENERATION_LEASE_MS) {
      return { kind: "busy", startedAt: started };
    }
    // quote_data holds something that isn't a quote (the old '{}' default):
    // no lease can match, so regenerate unlocked as before.
    return unavailable("quote_data is set without line items", false);
  } catch (e) {
    return unavailable(e instanceof Error ? e.message : String(e), true);
  }
}

/** Re-stamp a lease we still hold. False once it's gone (saved, or taken over). */
export async function renewGenerationLease(
  db: Db,
  lease: GenerationLease,
  now: () => number = Date.now,
): Promise<boolean> {
  const next = new Date(now()).toISOString();
  const { data, error } = await db
    .from("quotes")
    .update({ generation_started_at: next })
    .eq("id", lease.quoteId)
    .eq("user_id", lease.userId)
    .eq("generation_started_at", lease.stamp)
    .select("id");
  if (error || !Array.isArray(data) || data.length === 0) return false;
  lease.stamp = next;
  return true;
}

/** Clear OUR lease (never one another request has since taken over). */
export async function releaseGenerationLease(
  db: Db,
  lease: GenerationLease,
): Promise<void> {
  try {
    const { error } = await db
      .from("quotes")
      .update({ generation_started_at: null })
      .eq("id", lease.quoteId)
      .eq("user_id", lease.userId)
      .eq("generation_started_at", lease.stamp);
    if (error) console.warn("[generation-lease] release failed:", error.message);
  } catch (e) {
    // It goes stale in GENERATION_LEASE_MS anyway.
    console.warn("[generation-lease] release failed:", e);
  }
}

export interface LeaseHeartbeat {
  /** Stop refreshing; resolves once any refresh in flight has settled. */
  stop(): Promise<void>;
}

export function startLeaseHeartbeat(
  db: Db,
  lease: GenerationLease,
  opts: { intervalMs?: number; now?: () => number } = {},
): LeaseHeartbeat {
  let stopped = false;
  let inflight: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (stopped || inflight) return;
    inflight = renewGenerationLease(db, lease, opts.now)
      .then((held) => {
        if (!held) {
          stopped = true;
          clearInterval(timer);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
  }, opts.intervalMs ?? GENERATION_LEASE_HEARTBEAT_MS);
  // Never keep the process alive just to refresh a lease.
  (timer as { unref?: () => void }).unref?.();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      // Let a refresh in flight land first, so a release after this sees
      // the stamp actually in the row.
      if (inflight) await inflight;
    },
  };
}
