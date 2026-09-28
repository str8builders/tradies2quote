import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The processed-events ledger shared by the two Stripe webhooks, keyed on
 * (endpoint, event id).
 *
 * Stripe sends the SAME event (checkout.session.completed) to every endpoint
 * that subscribes to it. Keyed on the event id alone, whichever webhook
 * recorded it first made the other skip it as a duplicate: a deposit stayed
 * "pending" and the quote's other payment links stayed payable.
 *
 * supabase/migrations/20260929_stripe_webhook_ledger_endpoint.sql adds the
 * `endpoint` column and moves the unique key to (endpoint, event_id). Until
 * it is applied the column doesn't exist; every call then falls back to the
 * old single-key shape, with the payments endpoint's ids prefixed
 * ("payments:evt_…") so the two webhooks still can't collide. The migration
 * turns those prefixed rows into proper (payments, evt_…) rows.
 */

export type WebhookEndpoint = "subscriptions" | "payments";

type Db = SupabaseClient<Database>;
type DbError = { code?: string; message?: string } | null;

const TABLE = "stripe_webhook_events";

/** The id stored for an endpoint before the endpoint column exists. */
export function legacyLedgerKey(endpoint: WebhookEndpoint, eventId: string): string {
  // The subscriptions webhook's existing rows are plain event ids: keep them.
  return endpoint === "subscriptions" ? eventId : `${endpoint}:${eventId}`;
}

/** The database hasn't got the `endpoint` column yet (migration not applied). */
export function isMissingEndpointColumn(error: DbError): boolean {
  if (!error) return false;
  // 42703: Postgres undefined_column (filters). PGRST204: PostgREST's
  // "Could not find the 'endpoint' column … in the schema cache" (writes).
  return (error.code === "42703" || error.code === "PGRST204") && /endpoint/i.test(error.message ?? "");
}

export type LedgerLookup = { ok: true; done: boolean } | { ok: false; error: unknown };

/** Has this endpoint already finished this event? */
export async function ledgerHasEvent(db: Db, endpoint: WebhookEndpoint, eventId: string): Promise<LedgerLookup> {
  const current = await db
    .from(TABLE)
    .select("event_id")
    .eq("endpoint" as never, endpoint as never)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!current.error) return { ok: true, done: Boolean(current.data) };
  if (!isMissingEndpointColumn(current.error)) return { ok: false, error: current.error };
  const legacy = await db
    .from(TABLE)
    .select("event_id")
    .eq("event_id", legacyLedgerKey(endpoint, eventId))
    .maybeSingle();
  if (legacy.error) return { ok: false, error: legacy.error };
  return { ok: true, done: Boolean(legacy.data) };
}

export type LedgerRecord = { ok: true; duplicate: boolean } | { ok: false; error: unknown };

/** Record the event for this endpoint. A row that already exists is a duplicate delivery. */
export async function ledgerRecordEvent(
  db: Db,
  endpoint: WebhookEndpoint,
  eventId: string,
  type: string,
): Promise<LedgerRecord> {
  const current = await db.from(TABLE).insert({ endpoint, event_id: eventId, type } as never);
  if (!current.error) return { ok: true, duplicate: false };
  if (current.error.code === "23505") return { ok: true, duplicate: true };
  if (!isMissingEndpointColumn(current.error)) return { ok: false, error: current.error };
  const legacy = await db.from(TABLE).insert({ event_id: legacyLedgerKey(endpoint, eventId), type });
  if (!legacy.error) return { ok: true, duplicate: false };
  if (legacy.error.code === "23505") return { ok: true, duplicate: true };
  return { ok: false, error: legacy.error };
}

/** Remove this endpoint's record of the event (so a failed run can be retried). */
export async function ledgerForgetEvent(db: Db, endpoint: WebhookEndpoint, eventId: string): Promise<{ error: unknown }> {
  const current = await db
    .from(TABLE)
    .delete()
    .eq("endpoint" as never, endpoint as never)
    .eq("event_id", eventId);
  if (!current.error || !isMissingEndpointColumn(current.error)) return { error: current.error };
  const legacy = await db.from(TABLE).delete().eq("event_id", legacyLedgerKey(endpoint, eventId));
  return { error: legacy.error };
}
