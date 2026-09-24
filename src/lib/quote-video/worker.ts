/**
 * Quote video render worker — the job logic, kept free of Remotion, Supabase
 * and the file system so it can be unit-tested with fakes. The process that
 * wires the real ones in is scripts/quote-video-worker.mjs (systemd unit
 * deploy/t2q-video.service).
 *
 * One job:
 *   1. claim_quote_video_job() atomically moves the oldest queued row to
 *      'rendering' and counts the attempt;
 *   2. the quote and profile are read with the service role; a quote that is
 *      gone, has no lines, or has moved to a newer version fails for good
 *      ('quote_missing' / 'no_items' / 'stale');
 *   3. props are built (src/lib/quote-video/props.ts), the logo is inlined,
 *      the MP4 and the poster JPEG are rendered into a fresh temp folder;
 *   4. both files are uploaded to quote-videos/{user}/{quote}/v{version}.*,
 *      the row becomes 'ready', and older versions' files and rows go;
 *   5. any error re-queues the job until its third attempt, then 'failed'.
 * The temp folder is removed after every job. Every row update is guarded by
 * (status = 'rendering', attempts = this claim), so a job that was reclaimed
 * meanwhile is never overwritten.
 *
 * Logs carry ids, codes and timings only — never names, addresses or amounts.
 * Loaded by Node's TypeScript type stripping: runtime imports stay relative
 * with a `.ts` extension.
 */
import { buildQuoteVideoProps, type QuoteVideoProfileInput, type QuoteVideoProps, type QuoteVideoQuoteInput } from "./props.ts";
import {
  QUOTE_VIDEO_BUCKET,
  QUOTE_VIDEO_MAX_ATTEMPTS,
  quoteVideoFileVersion,
  quoteVideoPaths,
} from "./constants.ts";

export type QuoteVideoJob = {
  id: string;
  quote_id: string;
  user_id: string;
  quote_version: number;
  attempts: number;
};

type DbError = { message?: string; code?: string } | null;
type DbResult<T = unknown> = { data: T | null; error: DbError };

/** A chainable supabase-js query, reduced to what the worker calls. */
export interface WorkerQuery extends PromiseLike<DbResult> {
  select(columns?: string): WorkerQuery;
  eq(column: string, value: unknown): WorkerQuery;
  lt(column: string, value: unknown): WorkerQuery;
  maybeSingle(): PromiseLike<DbResult>;
}

export interface WorkerBucket {
  upload(
    path: string,
    body: Uint8Array,
    options: { contentType: string; upsert: boolean; cacheControl?: string },
  ): PromiseLike<{ error: DbError | unknown }>;
  list(
    path: string,
    options?: { limit?: number; offset?: number },
  ): PromiseLike<{ data: Array<{ name: string; id: string | null }> | null; error: DbError | unknown }>;
  remove(paths: string[]): PromiseLike<{ error: DbError | unknown }>;
}

/** The slice of a service-role supabase-js client the worker uses. */
export interface WorkerDb {
  rpc(fn: "claim_quote_video_job"): PromiseLike<DbResult>;
  from(table: "quotes" | "profiles" | "quote_videos"): {
    select(columns: string): WorkerQuery;
    update(values: Record<string, unknown>): WorkerQuery;
    delete(): WorkerQuery;
  };
  storage: { from(bucket: string): WorkerBucket };
}

export type RenderedFiles = { videoPath: string; posterPath: string };

export interface QuoteVideoRenderer {
  /** Render the MP4 and the poster JPEG into `outDir`. Must stop and reject once `signal` aborts. */
  render(props: QuoteVideoProps, outDir: string, signal: AbortSignal): Promise<RenderedFiles>;
}

export type LogFields = Record<string, string | number | boolean | null>;

export type WorkerDeps = {
  db: WorkerDb;
  renderer: QuoteVideoRenderer;
  /** Fetch and normalise an already-validated logo URL; null when it cannot be used. */
  loadLogo(url: string): Promise<{ src: string; aspect: number } | null>;
  files: {
    makeTempDir(): Promise<string>;
    readFile(path: string): Promise<Uint8Array>;
    removeDir(path: string): Promise<void>;
  };
  log(event: string, fields?: LogFields): void;
  now(): number;
  /** NEXT_PUBLIC_SUPABASE_URL — the only origin a logo may come from. */
  supabaseUrl: string | null;
  /** A render still running after this long is cancelled and retried. */
  renderTimeoutMs: number;
  /** Aborts on SIGTERM: the job in flight goes back to the queue without using an attempt. */
  shutdownSignal?: AbortSignal;
};

export type JobOutcome =
  | { kind: "ready"; ms: number }
  | { kind: "retry"; code: string }
  | { kind: "failed"; code: string }
  | { kind: "released" }
  | { kind: "lost" };

/** Codes written to quote_videos.error. Short and free of personal data by construction. */
export type FailureCode =
  | "stale"
  | "quote_missing"
  | "no_items"
  | "load_failed"
  | "render_failed"
  | "render_timeout"
  | "upload_failed";

const QUOTE_COLUMNS = "id, user_id, version, status, deleted_at, quote_data, total_amount, currency, expires_at";
const PROFILE_COLUMNS = "business_name, logo_url, country, currency";

type QuoteRow = QuoteVideoQuoteInput & {
  id: string;
  user_id: string;
  version: number;
  deleted_at: string | null;
};

/** The error's class name only (e.g. "TimeoutError"); messages can quote rendered text. */
export function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name) ? name : "Error";
}

/** PNG or JPEG by magic bytes — the only types the business-logos bucket accepts. */
export function sniffLogoType(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

function hasLineItems(quoteData: unknown): boolean {
  const items = (quoteData as { line_items?: unknown } | null)?.line_items;
  return Array.isArray(items) && items.length > 0;
}

function toJob(row: unknown): QuoteVideoJob | null {
  const r = row as Partial<QuoteVideoJob> | null;
  if (!r || typeof r.id !== "string" || typeof r.quote_id !== "string" || typeof r.user_id !== "string") return null;
  if (!Number.isInteger(r.quote_version) || !Number.isInteger(r.attempts)) return null;
  return { id: r.id, quote_id: r.quote_id, user_id: r.user_id, quote_version: r.quote_version as number, attempts: r.attempts as number };
}

/** Claim the oldest queued job, or null when the queue is empty. Throws when the RPC fails. */
export async function claimNextJob(db: WorkerDb): Promise<QuoteVideoJob | null> {
  const { data, error } = await db.rpc("claim_quote_video_job");
  if (error) throw new Error(`claim failed${error.code ? ` (${error.code})` : ""}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? toJob(row) : null;
}

/**
 * Write the job's outcome, but only while this claim still owns the row.
 * Returns false when the row moved on (reclaimed, deleted) or the write
 * failed; a row left 'rendering' is re-queued by the claim after 15 minutes.
 */
async function settle(deps: WorkerDeps, job: QuoteVideoJob, values: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await deps.db
      .from("quote_videos")
      .update({ ...values, updated_at: new Date(deps.now()).toISOString() })
      .eq("id", job.id)
      .eq("status", "rendering")
      .eq("attempts", job.attempts)
      .select("id");
    if (error) {
      deps.log("job.settle_failed", { job: job.id, code: error.code ?? null });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    deps.log("job.settle_failed", { job: job.id, err: errorName(e) });
    return false;
  }
}

async function removeOlderVersions(deps: WorkerDeps, job: QuoteVideoJob): Promise<void> {
  const { folder } = quoteVideoPaths(job.user_id, job.quote_id, job.quote_version);
  try {
    const bucket = deps.db.storage.from(QUOTE_VIDEO_BUCKET);
    const listed = await bucket.list(folder, { limit: 100 });
    const old = (listed.data ?? [])
      .filter((file) => file.id !== null)
      .filter((file) => {
        const version = quoteVideoFileVersion(file.name);
        return version !== null && version < job.quote_version;
      })
      .map((file) => `${folder}/${file.name}`);
    if (old.length > 0) await bucket.remove(old);
    await deps.db.from("quote_videos").delete().eq("quote_id", job.quote_id).lt("quote_version", job.quote_version);
    if (old.length > 0) deps.log("job.cleanup", { job: job.id, files: old.length });
  } catch (e) {
    // Tidying is best effort: an old file never reaches a client (only the
    // current version is ever served) and the account purge removes the prefix.
    deps.log("job.cleanup_failed", { job: job.id, err: errorName(e) });
  }
}

async function loadQuote(deps: WorkerDeps, job: QuoteVideoJob): Promise<{ quote: QuoteRow | null; profile: QuoteVideoProfileInput }> {
  const quoteRes = await deps.db.from("quotes").select(QUOTE_COLUMNS).eq("id", job.quote_id).maybeSingle();
  if (quoteRes.error) throw new Error("quote read failed");
  const quote = (quoteRes.data as QuoteRow | null) ?? null;
  if (!quote) return { quote: null, profile: null };
  const profileRes = await deps.db.from("profiles").select(PROFILE_COLUMNS).eq("id", job.user_id).maybeSingle();
  if (profileRes.error) throw new Error("profile read failed");
  return { quote, profile: (profileRes.data as QuoteVideoProfileInput) ?? null };
}

/** Render, upload and record one claimed job. Never throws. */
export async function processJob(job: QuoteVideoJob, deps: WorkerDeps): Promise<JobOutcome> {
  const started = deps.now();
  const ids: LogFields = { job: job.id, quote: job.quote_id, version: job.quote_version, attempt: job.attempts };
  deps.log("job.start", ids);

  const giveUp = async (code: FailureCode): Promise<JobOutcome> => {
    const ok = await settle(deps, job, { status: "failed", error: code });
    deps.log(ok ? "job.failed" : "job.lost", { ...ids, code, ms: deps.now() - started });
    return ok ? { kind: "failed", code } : { kind: "lost" };
  };
  const retryOrGiveUp = async (code: FailureCode, error?: unknown): Promise<JobOutcome> => {
    if (job.attempts >= QUOTE_VIDEO_MAX_ATTEMPTS) return giveUp(code);
    const ok = await settle(deps, job, { status: "queued", error: code });
    deps.log(ok ? "job.retry" : "job.lost", {
      ...ids,
      code,
      err: error === undefined ? null : errorName(error),
      ms: deps.now() - started,
    });
    return ok ? { kind: "retry", code } : { kind: "lost" };
  };

  let loaded: Awaited<ReturnType<typeof loadQuote>>;
  try {
    loaded = await loadQuote(deps, job);
  } catch (e) {
    return retryOrGiveUp("load_failed", e);
  }
  const { quote, profile } = loaded;
  if (!quote || quote.deleted_at !== null || quote.user_id !== job.user_id) return giveUp("quote_missing");
  // The client only ever sees a video of the quote's current version.
  if (quote.version !== job.quote_version) return giveUp("stale");
  if (!hasLineItems(quote.quote_data)) return giveUp("no_items");

  const props = buildQuoteVideoProps(quote, profile, { supabaseUrl: deps.supabaseUrl });
  if (props.logoSrc) {
    const logo = await deps.loadLogo(props.logoSrc).catch(() => null);
    props.logoSrc = logo?.src ?? null;
    props.logoAspect = logo?.aspect ?? null;
    if (!logo) deps.log("job.logo_skipped", { job: job.id });
  }

  let dir: string | null = null;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("render timeout"));
  }, deps.renderTimeoutMs);
  const onShutdown = () => controller.abort(new Error("shutdown"));
  deps.shutdownSignal?.addEventListener("abort", onShutdown, { once: true });
  let stage: "render" | "upload" = "render";
  try {
    if (deps.shutdownSignal?.aborted) throw new Error("shutdown");
    dir = await deps.files.makeTempDir();
    const renderStarted = deps.now();
    const files = await deps.renderer.render(props, dir, controller.signal);
    const renderMs = deps.now() - renderStarted;
    clearTimeout(timer);

    stage = "upload";
    const paths = quoteVideoPaths(job.user_id, job.quote_id, job.quote_version);
    const bucket = deps.db.storage.from(QUOTE_VIDEO_BUCKET);
    const video = await deps.files.readFile(files.videoPath);
    const poster = await deps.files.readFile(files.posterPath);
    const uploadStarted = deps.now();
    for (const [path, body, contentType] of [
      [paths.video, video, "video/mp4"],
      [paths.poster, poster, "image/jpeg"],
    ] as const) {
      const { error } = await bucket.upload(path, body, { contentType, upsert: true, cacheControl: "3600" });
      if (error) throw new Error("upload failed");
    }
    const uploadMs = deps.now() - uploadStarted;

    const ok = await settle(deps, job, {
      status: "ready",
      storage_path: paths.video,
      poster_path: paths.poster,
      error: null,
      rendered_at: new Date(deps.now()).toISOString(),
    });
    const ms = deps.now() - started;
    if (!ok) {
      deps.log("job.lost", { ...ids, ms });
      return { kind: "lost" };
    }
    deps.log("job.ready", { ...ids, ms, render_ms: renderMs, upload_ms: uploadMs, bytes: video.byteLength });
    await removeOlderVersions(deps, job);
    return { kind: "ready", ms };
  } catch (e) {
    if (deps.shutdownSignal?.aborted && !timedOut) {
      // Stopping for a deploy or reboot is not the job's fault: hand it back
      // with the attempt it used restored.
      const ok = await settle(deps, job, { status: "queued", error: null, attempts: Math.max(0, job.attempts - 1) });
      deps.log(ok ? "job.released" : "job.lost", { ...ids, ms: deps.now() - started });
      return ok ? { kind: "released" } : { kind: "lost" };
    }
    if (stage === "upload") return retryOrGiveUp("upload_failed", e);
    return retryOrGiveUp(timedOut ? "render_timeout" : "render_failed", e);
  } finally {
    clearTimeout(timer);
    deps.shutdownSignal?.removeEventListener("abort", onShutdown);
    if (dir) {
      await deps.files.removeDir(dir).catch((e: unknown) => deps.log("job.tmp_cleanup_failed", { job: job.id, err: errorName(e) }));
    }
  }
}

export type LoopOptions = {
  /** Wait between polls while the queue is empty (5–10 s). */
  pollMs: number;
  /** Wait after the claim RPC fails (database restarting, network). */
  errorBackoffMs: number;
  /** Process at most one job, then return. */
  once?: boolean;
  stopSignal: AbortSignal;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
};

/**
 * Claim and process jobs until `stopSignal` aborts (or one job with `once`).
 * Returns the last outcome, or "idle" when `once` found an empty queue.
 */
export async function runQuoteVideoWorker(deps: WorkerDeps, options: LoopOptions): Promise<JobOutcome | "idle"> {
  let last: JobOutcome | "idle" = "idle";
  while (!options.stopSignal.aborted) {
    let job: QuoteVideoJob | null;
    try {
      job = await claimNextJob(deps.db);
    } catch (e) {
      deps.log("claim.failed", { err: errorName(e) });
      if (options.once) return last;
      await options.sleep(options.errorBackoffMs, options.stopSignal);
      continue;
    }
    if (!job) {
      if (options.once) return "idle";
      await options.sleep(options.pollMs, options.stopSignal);
      continue;
    }
    last = await processJob(job, { ...deps, shutdownSignal: options.stopSignal });
    if (options.once) return last;
  }
  return last;
}
