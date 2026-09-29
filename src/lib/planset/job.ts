import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the background job that reads a whole set.
//
// Started after the upload (route `after()`), and re-started by the status
// poll if its lease goes stale (server restart mid-read). Resumable: sheets
// already read are skipped. One set at a time per server process, so a
// 49-sheet A1 set can't starve the live app; pdf.js runs on a worker thread.
//
//   uploading → queued → reading → ready | failed
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { openPlanPdf, type OpenPlanPdf } from "./pdf/read";
import { readSheetFacts, type SheetFacts } from "./sheetFacts";
import { MAX_SET_BYTES, MAX_SET_PAGES, PLAN_BUCKET, isPdf } from "./storage";
import { finishPlanSet, type FinishResult } from "./finish";

export const PLAN_SET_LEASE_MS = 3 * 60_000;
export const PLAN_SET_HEARTBEAT_MS = 30_000;

export type JobOutcome = "done" | "busy" | "missing" | "failed";

export type JobDeps = {
  db: SupabaseClient;
  download: (path: string) => Promise<Uint8Array>;
  open: (bytes: Uint8Array) => Promise<OpenPlanPdf>;
  finish: (input: { setId: string; userId: string; facts: SheetFacts[]; pdf: Uint8Array; progress: (step: string) => Promise<void> }) => Promise<FinishResult>;
  now: () => number;
};

function defaultDeps(): JobDeps {
  const db = adminClient() as unknown as SupabaseClient;
  return {
    db,
    download: async (path) => {
      const { data, error } = await db.storage.from(PLAN_BUCKET).download(path);
      if (error || !data) throw new Error(`The uploaded plans couldn't be fetched (${error?.message ?? "no file"}).`);
      return new Uint8Array(await data.arrayBuffer());
    },
    open: (bytes) => openPlanPdf(bytes),
    finish: finishPlanSet,
    now: Date.now,
  };
}

// ── one set at a time per process ────────────────────────────────────────
let running = 0;
const waiting: Array<() => void> = [];
async function inSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 1) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** A plain sentence for the tradie; details go to the error sink. */
export class PlanSetError extends Error {}

/** Read a whole plan set. Safe to call twice: the lease lets only one run. */
export async function runPlanSetJob(setId: string, overrides: Partial<JobDeps> = {}): Promise<JobOutcome> {
  const deps = { ...defaultDeps(), ...overrides };
  return inSlot(() => runClaimed(setId, deps));
}

async function runClaimed(setId: string, deps: JobDeps): Promise<JobOutcome> {
  const { db, now } = deps;
  const stamp = new Date(now()).toISOString();
  const staleBefore = new Date(now() - PLAN_SET_LEASE_MS).toISOString();
  const claim = await db
    .from("plan_sets")
    .update({ status: "reading", lease_at: stamp, step: "Opening the plans", error: null, updated_at: stamp })
    .eq("id", setId)
    .in("status", ["queued", "reading"])
    .or(`lease_at.is.null,lease_at.lt.${staleBefore}`)
    .select("id, user_id, storage_path, byte_size");
  if (claim.error) throw new Error(`plan-set claim failed: ${claim.error.message}`);
  const row = claim.data?.[0] as { id: string; user_id: string; storage_path: string; byte_size: number } | undefined;
  if (!row) {
    const exists = await db.from("plan_sets").select("id").eq("id", setId).maybeSingle();
    return exists.data ? "busy" : "missing";
  }

  const heartbeat = setInterval(() => {
    void db.from("plan_sets").update({ lease_at: new Date(now()).toISOString() }).eq("id", setId);
  }, PLAN_SET_HEARTBEAT_MS);
  const progress = async (step: string, extra: Record<string, unknown> = {}) => {
    await db.from("plan_sets").update({ step, progress: extra, lease_at: new Date(now()).toISOString(), updated_at: new Date(now()).toISOString() }).eq("id", setId);
  };

  let pdf: OpenPlanPdf | null = null;
  try {
    if (row.byte_size > MAX_SET_BYTES) throw new PlanSetError("That PDF is bigger than 50 MB. Split it into two files and upload each.");
    const bytes = await deps.download(row.storage_path);
    if (!isPdf(bytes)) throw new PlanSetError("That file isn't a PDF. Upload the plans as the PDF the designer sent.");
    try {
      pdf = await deps.open(bytes);
    } catch {
      throw new PlanSetError("The PDF couldn't be opened. If it has a password, save a copy without one and upload that.");
    }
    const total = pdf.pageCount;
    if (total > MAX_SET_PAGES) throw new PlanSetError(`That PDF has ${total} pages; the most is ${MAX_SET_PAGES}. Upload the drawings on their own.`);
    await db.from("plan_sets").update({ page_count: total }).eq("id", setId);

    const done = await db.from("plan_set_sheets").select("page").eq("set_id", setId);
    const have = new Set((done.data ?? []).map((r: { page: number }) => r.page));
    for (let n = 1; n <= total; n++) {
      if (have.has(n)) continue;
      await progress(`Reading sheet ${n} of ${total}`, { done: n - 1, total });
      const raw = await pdf.readPage(n);
      const facts = readSheetFacts(raw);
      const up = await db.from("plan_set_sheets").upsert({
        set_id: setId,
        user_id: row.user_id,
        page: n,
        sheet_id: facts.title.sheetId,
        title: facts.title.title,
        kind: facts.kind,
        building: facts.building,
        scale_ratio: facts.scale.ratio,
        scale_basis: facts.scale.basis,
        facts,
      });
      if (up.error) throw new Error(`saving sheet ${n}: ${up.error.message}`);
    }

    await progress("Putting the building together", { done: total, total });
    const all = await db.from("plan_set_sheets").select("facts").eq("set_id", setId).order("page");
    if (all.error) throw new Error(`loading sheets: ${all.error.message}`);
    const facts = (all.data ?? []).map((r: { facts: SheetFacts }) => r.facts);
    const result = await deps.finish({ setId, userId: row.user_id, facts, pdf: bytes, progress: (step) => progress(step, { done: total, total }) });
    for (const s of result.sheetUpdates) {
      await db.from("plan_set_sheets").update({ kind: s.kind, building: s.building, scale_ratio: s.scaleRatio, scale_basis: s.scaleBasis, facts: s.facts }).eq("set_id", setId).eq("page", s.page);
    }
    const fin = await db
      .from("plan_sets")
      .update({ status: "ready", step: null, progress: { done: total, total }, register: result.register, model: result.model, ai_usage: result.aiUsage, lease_at: null, updated_at: new Date(now()).toISOString() })
      .eq("id", setId);
    if (fin.error) throw new Error(`saving the model: ${fin.error.message}`);
    return "done";
  } catch (e) {
    const message = e instanceof PlanSetError ? e.message : "Something went wrong reading these plans. Try again, and if it happens again, tell us.";
    if (!(e instanceof PlanSetError)) captureError(e, { route: "plansets/job" });
    await db.from("plan_sets").update({ status: "failed", error: message, step: null, lease_at: null, updated_at: new Date(now()).toISOString() }).eq("id", setId);
    return "failed";
  } finally {
    clearInterval(heartbeat);
    if (pdf) await pdf.close().catch(() => {});
  }
}
