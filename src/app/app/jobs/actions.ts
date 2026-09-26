"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { deletedTogether, parseJobIds } from "../_v2/lib/job-board";

/**
 * Delete and restore jobs from the new-look Jobs list (select mode and
 * Recently deleted).
 *
 * A job is a quote with its invoices. Deleting one soft-deletes the quote
 * AND every invoice of it, all stamped with the same time: the Home money
 * tiles add up every invoice on the board, so an invoice left behind would
 * keep counting. Restoring brings back the quote and the invoices deleted
 * with it (same time, give or take a few seconds); an invoice deleted on
 * its own earlier stays deleted. Nothing is ever hard-deleted.
 *
 * Security: the user comes from supabase.auth.getUser() on the server,
 * never from the caller, and every read and write is scoped to that user's
 * id on top of RLS (quotes_all_own, invoices_all_own). Ids are checked
 * (real ids, at most JOBS_ACTION_LIMIT), so another user's id is a no-op.
 *
 * The two tables are written one after the other (no transaction through
 * PostgREST); when the second write fails the first is put back, so a job
 * is never left gone while its invoices still count.
 */

export type JobsActionResult =
  | { ok: true; count: number; ids: string[] }
  | { ok: false; error: string };

type Db = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

/** Ids per request: a long `in.(…)` list can overflow the URL limit. */
const IDS_PER_REQUEST = 100;

const DELETE_FAILED = "Couldn't delete those jobs. Check your signal and try again.";
const RESTORE_FAILED = "Couldn't restore those jobs. Check your signal and try again.";

async function signedIn(): Promise<{ db: Db; userId: string }> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, userId: user.id };
}

function report(error: unknown, route: string): void {
  console.error(`[${route}] failed`, error);
  captureError(error, { route, surface: "server_action" });
}

function refreshLists(): void {
  revalidatePath("/app/jobs");
  revalidatePath("/app");
}

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += IDS_PER_REQUEST) out.push(list.slice(i, i + IDS_PER_REQUEST));
  return out;
}

function rowsOf(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

function idsOf(data: unknown): string[] {
  return rowsOf(data).map((row) => String(row.id));
}

function timeOf(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Undo a delete this call made: the invoices and quotes stamped with `at`.
 * Best effort; a failure here is reported.
 */
async function undoDelete(db: Db, userId: string, quoteIds: readonly string[], at: string): Promise<void> {
  for (const part of chunks(quoteIds)) {
    const invoices = await db
      .from("invoices")
      .update({ deleted_at: null })
      .eq("user_id", userId)
      .in("quote_id", part)
      .eq("deleted_at", at);
    if (invoices.error) report(invoices.error, "actions/deleteJobs:undo-invoices");
    const quotes = await db
      .from("quotes")
      .update({ deleted_at: null })
      .eq("user_id", userId)
      .in("id", part)
      .eq("deleted_at", at);
    if (quotes.error) report(quotes.error, "actions/deleteJobs:undo-quotes");
  }
}

/**
 * Delete jobs: their quotes and all their invoices, stamped with one time.
 * Returns how many jobs were deleted and which (for Undo). Jobs already
 * deleted are left alone.
 */
export async function deleteJobs(quoteIds: string[]): Promise<JobsActionResult> {
  const check = parseJobIds(quoteIds);
  if (!check.ok) return check;
  const { db, userId } = await signedIn();
  const at = new Date().toISOString();

  const deleted: string[] = [];
  for (const part of chunks(check.ids)) {
    const quotes = await db
      .from("quotes")
      .update({ deleted_at: at })
      .eq("user_id", userId)
      .in("id", part)
      .is("deleted_at", null)
      .select("id");
    if (quotes.error) {
      report(quotes.error, "actions/deleteJobs:quotes");
      await undoDelete(db, userId, deleted, at);
      return { ok: false, error: DELETE_FAILED };
    }
    deleted.push(...idsOf(quotes.data));
  }

  for (const part of chunks(deleted)) {
    const invoices = await db
      .from("invoices")
      .update({ deleted_at: at })
      .eq("user_id", userId)
      .in("quote_id", part)
      .is("deleted_at", null);
    if (invoices.error) {
      report(invoices.error, "actions/deleteJobs:invoices");
      await undoDelete(db, userId, deleted, at);
      return { ok: false, error: DELETE_FAILED };
    }
  }

  refreshLists();
  return { ok: true, count: deleted.length, ids: deleted };
}

/** Delete rows again, each with the time it had, after a restore that failed half way. */
async function deleteAgain(
  db: Db,
  userId: string,
  table: "quotes" | "invoices",
  rows: ReadonlyArray<{ id: string; at: string }>,
): Promise<void> {
  const byTime = new Map<string, string[]>();
  for (const { id, at } of rows) byTime.set(at, [...(byTime.get(at) ?? []), id]);
  for (const [at, ids] of byTime) {
    for (const part of chunks(ids)) {
      const res = await db
        .from(table)
        .update({ deleted_at: at })
        .eq("user_id", userId)
        .in("id", part)
        .is("deleted_at", null);
      if (res.error) report(res.error, `actions/restoreJobs:undo-${table}`);
    }
  }
}

/** The jobs with the delete time each had (for putting them back). */
function asDeleted(ids: readonly string[], deletedAt: ReadonlyMap<string, string>): Array<{ id: string; at: string }> {
  return ids.flatMap((id) => {
    const at = deletedAt.get(id);
    return at ? [{ id, at }] : [];
  });
}

/**
 * Restore deleted jobs: their quotes, and the invoices deleted with them.
 * Invoices deleted separately, earlier, stay deleted. Returns how many
 * jobs came back and which.
 */
export async function restoreJobs(quoteIds: string[]): Promise<JobsActionResult> {
  const check = parseJobIds(quoteIds);
  if (!check.ok) return check;
  const { db, userId } = await signedIn();

  // When each job was deleted.
  const quoteDeletedAt = new Map<string, string>();
  for (const part of chunks(check.ids)) {
    const quotes = await db
      .from("quotes")
      .select("id, deleted_at")
      .eq("user_id", userId)
      .in("id", part)
      .not("deleted_at", "is", null);
    if (quotes.error) {
      report(quotes.error, "actions/restoreJobs:read-quotes");
      return { ok: false, error: RESTORE_FAILED };
    }
    for (const row of rowsOf(quotes.data)) {
      const at = timeOf(row.deleted_at);
      if (at) quoteDeletedAt.set(String(row.id), at);
    }
  }
  const found = [...quoteDeletedAt.keys()];
  if (found.length === 0) {
    refreshLists();
    return { ok: true, count: 0, ids: [] };
  }

  // Their deleted invoices; only the ones deleted with the job come back.
  const withTheirJob: Array<{ id: string; quoteId: string; at: string }> = [];
  for (const part of chunks(found)) {
    const invoices = await db
      .from("invoices")
      .select("id, quote_id, deleted_at")
      .eq("user_id", userId)
      .in("quote_id", part)
      .not("deleted_at", "is", null);
    if (invoices.error) {
      report(invoices.error, "actions/restoreJobs:read-invoices");
      return { ok: false, error: RESTORE_FAILED };
    }
    for (const row of rowsOf(invoices.data)) {
      const quoteId = String(row.quote_id);
      const at = timeOf(row.deleted_at);
      if (at && deletedTogether(quoteDeletedAt.get(quoteId), at)) {
        withTheirJob.push({ id: String(row.id), quoteId, at });
      }
    }
  }

  const restored: string[] = [];
  for (const part of chunks(found)) {
    const quotes = await db
      .from("quotes")
      .update({ deleted_at: null })
      .eq("user_id", userId)
      .in("id", part)
      .not("deleted_at", "is", null)
      .select("id");
    if (quotes.error) {
      report(quotes.error, "actions/restoreJobs:quotes");
      await deleteAgain(db, userId, "quotes", asDeleted(restored, quoteDeletedAt));
      return { ok: false, error: RESTORE_FAILED };
    }
    restored.push(...idsOf(quotes.data));
  }

  const back = new Set(restored);
  const invoices = withTheirJob.filter((invoice) => back.has(invoice.quoteId));
  const invoicesBack: typeof invoices = [];
  for (const part of chunks(invoices)) {
    const res = await db
      .from("invoices")
      .update({ deleted_at: null })
      .eq("user_id", userId)
      .in("id", part.map((invoice) => invoice.id));
    if (res.error) {
      report(res.error, "actions/restoreJobs:invoices");
      // A job must not come back without its invoices: delete it again, as it was.
      await deleteAgain(db, userId, "invoices", invoicesBack);
      await deleteAgain(db, userId, "quotes", asDeleted(restored, quoteDeletedAt));
      return { ok: false, error: RESTORE_FAILED };
    }
    invoicesBack.push(...part);
  }

  refreshLists();
  return { ok: true, count: restored.length, ids: restored };
}
