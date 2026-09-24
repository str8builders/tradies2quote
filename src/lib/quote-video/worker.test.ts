import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";
import {
  claimNextJob,
  errorName,
  processJob,
  runQuoteVideoWorker,
  sniffLogoType,
  type QuoteVideoJob,
  type QuoteVideoRenderer,
  type WorkerDb,
  type WorkerDeps,
} from "./worker";
import { SAMPLE_QUOTE } from "./sample";
import type { QuoteVideoProps } from "./props";

const USER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE = "5d0a1c2e-5555-4666-8777-988888888888";
const JOB = "7a1b2c3d-9999-4aaa-8bbb-cccccccccccc";
const SUPABASE_URL = "https://api.example.test";
const LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/business-logos/${USER}/logo.png`;

type Upload = { path: string; bytes: number; contentType: string; upsert: boolean };

function setup(overrides: { quote?: Record<string, unknown> | null; version?: number; attempts?: number; quoteError?: boolean } = {}) {
  const job: QuoteVideoJob = { id: JOB, quote_id: QUOTE, user_id: USER, quote_version: 3, attempts: overrides.attempts ?? 1 };
  const quoteRow =
    overrides.quote === null
      ? null
      : {
          id: QUOTE,
          user_id: USER,
          version: overrides.version ?? 3,
          status: "sent",
          deleted_at: null,
          ...SAMPLE_QUOTE,
          ...overrides.quote,
        };
  let settleRows: unknown[] = [{ id: JOB }];
  const db = fakeSupabase((op: FakeOp) => {
    if (op.table === "quotes") return overrides.quoteError ? { error: { code: "08006" } } : { data: quoteRow };
    if (op.table === "profiles") return { data: { business_name: "Taylor Carpentry", logo_url: LOGO_URL, country: "NZ", currency: "NZD" } };
    if (op.table === "quote_videos" && op.action === "update") return { data: settleRows };
    return {};
  });
  const uploads: Upload[] = [];
  const removed: string[][] = [];
  const listing = [
    { name: "v1.mp4", id: "a" },
    { name: "v1.jpg", id: "b" },
    { name: "v3.mp4", id: "c" },
    { name: "v3.jpg", id: "d" },
    { name: "v4.mp4", id: "e" },
    { name: "notes.txt", id: "f" },
  ];
  const bucket = {
    upload: vi.fn(async (path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
      uploads.push({ path, bytes: body.byteLength, contentType: options.contentType, upsert: options.upsert });
      return { error: null as unknown };
    }),
    list: vi.fn(async () => ({ data: listing, error: null })),
    remove: vi.fn(async (paths: string[]) => {
      removed.push(paths);
      return { error: null };
    }),
  };
  const rpc = vi.fn(async () => ({ data: [job] as unknown, error: null as { code?: string } | null }));
  const client = { from: db.from, rpc, storage: { from: () => bucket } } as unknown as WorkerDb;

  const rendered: QuoteVideoProps[] = [];
  const renderer: QuoteVideoRenderer = {
    render: vi.fn(async (props: QuoteVideoProps, outDir: string) => {
      rendered.push(props);
      return { videoPath: `${outDir}/video.mp4`, posterPath: `${outDir}/poster.jpg` };
    }),
  };
  const logs: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  let clock = 1_000_000;
  const deps: WorkerDeps = {
    db: client,
    renderer,
    loadLogo: vi.fn(async () => ({ src: "data:image/png;base64,AAAA", aspect: 2 })),
    files: {
      makeTempDir: vi.fn(async () => "/tmp/t2q-video-job"),
      readFile: vi.fn(async (path: string) => new Uint8Array(path.endsWith(".mp4") ? 2048 : 128)),
      removeDir: vi.fn(async () => undefined),
    },
    log: (event, fields) => logs.push({ event, fields }),
    now: () => (clock += 250),
    supabaseUrl: SUPABASE_URL,
    renderTimeoutMs: 5_000,
  };
  return {
    job,
    db,
    deps,
    uploads,
    removed,
    rendered,
    logs,
    bucket,
    rpc,
    setSettleRows: (rows: unknown[]) => (settleRows = rows),
    settles: () => db.ops.filter((op) => op.table === "quote_videos" && op.action === "update"),
  };
}

const filter = (op: FakeOp, column: string) => op.filters.find(([, name]) => name === column)?.[2];

describe("processJob — happy path", () => {
  it("renders, uploads both files, marks the row ready and tidies older versions", async () => {
    const t = setup();
    const outcome = await processJob(t.job, t.deps);
    expect(outcome.kind).toBe("ready");

    expect(t.uploads).toEqual([
      { path: `${USER}/${QUOTE}/v3.mp4`, bytes: 2048, contentType: "video/mp4", upsert: true },
      { path: `${USER}/${QUOTE}/v3.jpg`, bytes: 128, contentType: "image/jpeg", upsert: true },
    ]);
    const [ready] = t.settles();
    expect(ready.values).toMatchObject({
      status: "ready",
      storage_path: `${USER}/${QUOTE}/v3.mp4`,
      poster_path: `${USER}/${QUOTE}/v3.jpg`,
      error: null,
    });
    expect(typeof (ready.values as { rendered_at: unknown }).rendered_at).toBe("string");
    // Guarded by the claim: only this attempt of a still-rendering row is written.
    expect(filter(ready, "id")).toBe(JOB);
    expect(filter(ready, "status")).toBe("rendering");
    expect(filter(ready, "attempts")).toBe(1);

    // Older versions go (files and rows); the current and any newer file stay.
    expect(t.removed).toEqual([[`${USER}/${QUOTE}/v1.mp4`, `${USER}/${QUOTE}/v1.jpg`]]);
    const del = t.db.ops.find((op) => op.table === "quote_videos" && op.action === "delete");
    expect(del?.filters).toEqual([
      ["eq", "quote_id", QUOTE],
      ["lt", "quote_version", 3],
    ]);
    expect(t.deps.files.removeDir).toHaveBeenCalledWith("/tmp/t2q-video-job");
  });

  it("builds the props from the quote and inlines the logo", async () => {
    const t = setup();
    await processJob(t.job, t.deps);
    expect(t.deps.loadLogo).toHaveBeenCalledWith(LOGO_URL);
    const props = t.rendered[0];
    expect(props).toMatchObject({
      businessName: "Taylor Carpentry",
      clientName: "Sam",
      logoSrc: "data:image/png;base64,AAAA",
      logoAspect: 2,
      total: { text: "$4,830.00" },
      taxNote: "incl. GST",
    });
  });

  it("renders without a logo when it cannot be loaded", async () => {
    const t = setup();
    t.deps.loadLogo = vi.fn(async () => null);
    await processJob(t.job, t.deps);
    expect(t.rendered[0].logoSrc).toBeNull();
    expect(t.logs.some((l) => l.event === "job.logo_skipped")).toBe(true);
  });

  it("logs ids, codes and timings only — no names or amounts", async () => {
    const t = setup();
    await processJob(t.job, t.deps);
    const text = JSON.stringify(t.logs);
    for (const secret of ["Sam", "Taylor", "Rata", "4,830", "4830", "Kwila"]) expect(text).not.toContain(secret);
    const ready = t.logs.find((l) => l.event === "job.ready");
    expect(ready?.fields).toMatchObject({ job: JOB, quote: QUOTE, version: 3, attempt: 1 });
    expect(typeof ready?.fields?.render_ms).toBe("number");
  });
});

describe("processJob — stale and missing quotes fail for good", () => {
  it("fails with 'stale' when the quote moved to a newer version, without rendering", async () => {
    const t = setup({ version: 4 });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "failed", code: "stale" });
    expect(t.settles()[0].values).toMatchObject({ status: "failed", error: "stale" });
    expect(t.deps.renderer.render).not.toHaveBeenCalled();
    expect(t.uploads).toEqual([]);
  });

  it("fails with 'quote_missing' for a deleted quote", async () => {
    const t = setup({ quote: { deleted_at: "2026-09-20T00:00:00Z" } });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "failed", code: "quote_missing" });
  });

  it("fails with 'quote_missing' when the quote is gone or belongs to someone else", async () => {
    expect(await processJob(setup({ quote: null }).job, setup({ quote: null }).deps)).toEqual({ kind: "failed", code: "quote_missing" });
    const t = setup({ quote: { user_id: "11111111-2222-4333-8444-555555555555" } });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "failed", code: "quote_missing" });
  });

  it("fails with 'no_items' when the quote has no lines", async () => {
    const t = setup({ quote: { quote_data: { line_items: [] } } });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "failed", code: "no_items" });
  });
});

describe("processJob — retries", () => {
  it("re-queues a failed render while attempts remain, and cleans the temp folder", async () => {
    const t = setup({ attempts: 1 });
    t.deps.renderer.render = vi.fn(async () => {
      throw new Error("Chrome crashed while rendering Sam Taylor's quote");
    });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "retry", code: "render_failed" });
    expect(t.settles()[0].values).toMatchObject({ status: "queued", error: "render_failed" });
    expect(t.deps.files.removeDir).toHaveBeenCalledWith("/tmp/t2q-video-job");
    // The error message (which can quote rendered text) never reaches the row or the log.
    expect(JSON.stringify(t.settles())).not.toContain("Sam");
    expect(JSON.stringify(t.logs)).not.toContain("Sam");
  });

  it("fails for good on the third attempt", async () => {
    const t = setup({ attempts: 3 });
    t.deps.renderer.render = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "failed", code: "render_failed" });
    expect(t.settles()[0].values).toMatchObject({ status: "failed", error: "render_failed" });
    expect(t.deps.files.removeDir).toHaveBeenCalled();
  });

  it("re-queues an upload failure as 'upload_failed'", async () => {
    const t = setup({ attempts: 2 });
    t.bucket.upload.mockResolvedValueOnce({ error: { message: "Payload too large" } });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "retry", code: "upload_failed" });
  });

  it("re-queues a database read failure as 'load_failed'", async () => {
    const t = setup({ quoteError: true });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "retry", code: "load_failed" });
    expect(t.deps.renderer.render).not.toHaveBeenCalled();
  });

  it("cancels a render that runs past the timeout and retries it as 'render_timeout'", async () => {
    const t = setup();
    t.deps.renderTimeoutMs = 10;
    t.deps.renderer.render = (_props, _dir, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled"))));
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "retry", code: "render_timeout" });
  });

  it("hands the job back without using an attempt when the worker shuts down mid-render", async () => {
    const t = setup({ attempts: 2 });
    const stop = new AbortController();
    t.deps.shutdownSignal = stop.signal;
    t.deps.renderer.render = (_props, _dir, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")));
        stop.abort();
      });
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "released" });
    expect(t.settles()[0].values).toMatchObject({ status: "queued", error: null, attempts: 1 });
  });

  it("writes nothing more when the row was reclaimed meanwhile", async () => {
    const t = setup();
    t.setSettleRows([]);
    expect(await processJob(t.job, t.deps)).toEqual({ kind: "lost" });
    expect(t.db.ops.some((op) => op.action === "delete")).toBe(false);
  });
});

describe("claim and loop", () => {
  it("returns null for an empty queue and throws when the RPC fails", async () => {
    const t = setup();
    t.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await claimNextJob(t.deps.db)).toBeNull();
    t.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    await expect(claimNextJob(t.deps.db)).rejects.toThrow("claim failed (PGRST202)");
  });

  it("--once processes one job, or reports an idle queue", async () => {
    const t = setup();
    const sleep = vi.fn(async () => undefined);
    const stop = new AbortController();
    expect(await runQuoteVideoWorker(t.deps, { pollMs: 7000, errorBackoffMs: 30000, once: true, stopSignal: stop.signal, sleep })).toMatchObject({ kind: "ready" });
    t.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await runQuoteVideoWorker(t.deps, { pollMs: 7000, errorBackoffMs: 30000, once: true, stopSignal: stop.signal, sleep })).toBe("idle");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("polls while idle, backs off after a failed claim, and stops on the signal", async () => {
    const t = setup();
    const stop = new AbortController();
    t.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "08006" } })
      .mockResolvedValueOnce({ data: [], error: null });
    const waits: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      waits.push(ms);
      if (waits.length === 3) stop.abort();
    });
    await runQuoteVideoWorker(t.deps, { pollMs: 7000, errorBackoffMs: 30000, stopSignal: stop.signal, sleep });
    expect(waits).toEqual([7000, 30000, 7000]);
  });
});

describe("helpers", () => {
  it("sniffs PNG and JPEG only", () => {
    expect(sniffLogoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniffLogoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffLogoType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffLogoType(new Uint8Array([]))).toBeNull();
  });

  it("keeps only an error's class name", () => {
    expect(errorName(new TypeError("Sam Taylor"))).toBe("TypeError");
    expect(errorName("text")).toBe("Error");
    const odd = new Error("x");
    odd.name = "Name with spaces and Sam";
    expect(errorName(odd)).toBe("Error");
  });
});
