#!/usr/bin/env node
/**
 * Quote video render worker — renders the QuoteVideo composition on our own
 * server (Remotion + Chrome Headless Shell + the bundled ffmpeg). No third
 * party sees quote data: the only outbound requests are to our Supabase API
 * and to Google Fonts for the two font families.
 *
 *   node scripts/quote-video-worker.mjs                   long-running (systemd: deploy/t2q-video.service)
 *   node scripts/quote-video-worker.mjs --once            claim and process one job, then exit
 *   node scripts/quote-video-worker.mjs --sample[=DIR]    render the made-up sample without the database
 *                                                         (server smoke test; writes quote-video-sample.mp4/.jpg)
 *   node scripts/quote-video-worker.mjs --ensure-browser  download Chrome Headless Shell if missing, then exit
 *
 * Environment (the app's own names, from /srv/t2q/app.env):
 *   NEXT_PUBLIC_SUPABASE_URL    Supabase API; also the only origin a logo may come from
 *   SUPABASE_SERVICE_ROLE_KEY   service role (claim RPC, quote reads, private bucket uploads)
 *   T2Q_RENDER_BROWSER          optional Chrome Headless Shell path; without it Remotion keeps
 *                               its own copy in node_modules/.remotion (see --ensure-browser)
 *
 * Needs Node 22.18+ (built-in TypeScript type stripping): the job logic lives in
 * src/lib/quote-video/worker.ts so it can be unit-tested, and is imported as is.
 *
 * On start: bundle src/remotion/index.tsx once into a temp folder, check the
 * browser, then loop: claim a job, load the quote, render, upload, record
 * (see worker.ts). Idle polls every 7 s. SIGTERM/SIGINT hand the job in
 * flight back to the queue and exit. Logs are JSON lines with ids, codes and
 * timings only — never names, addresses or amounts.
 */
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));

const POLL_MS = 7_000;
const ERROR_BACKOFF_MS = 30_000;
/** Whole render (browser, video, poster). The claim hands back rows stuck for 15 minutes. */
const RENDER_TIMEOUT_MS = 4 * 60_000;
/** Per page step (fonts, delayRender); Remotion's default is 30 s. */
const PAGE_TIMEOUT_MS = 60_000;
const LOGO_TIMEOUT_MS = 10_000;
/** The business-logos bucket's own limit. */
const MAX_LOGO_BYTES = 8 * 1024 * 1024;

function log(event, fields = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

function parseArgs(argv) {
  const out = { once: false, sample: null, ensureBrowser: false, help: false };
  for (const arg of argv) {
    if (arg === "--once") out.once = true;
    else if (arg === "--sample") out.sample = "";
    else if (arg.startsWith("--sample=")) out.sample = arg.slice("--sample=".length);
    else if (arg === "--ensure-browser") out.ensureBrowser = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown option ${arg}. Use --help.`);
  }
  return out;
}

async function loadTs(relative) {
  try {
    return await import(pathToFileURL(path.join(ROOT, relative)).href);
  } catch (error) {
    if (error?.code === "ERR_UNKNOWN_FILE_EXTENSION") {
      throw new Error("This Node cannot load TypeScript files. Use Node 22.18 or newer (or add --experimental-strip-types).");
    }
    throw error;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Logo → PNG data: URI (trimmed, at most 640 px, EXIF-rotated) plus its
 * aspect ratio. Re-encoding means Chrome never parses the uploaded bytes and
 * never fetches anything for the logo.
 */
async function normaliseLogo(bytes) {
  const sharp = require("sharp");
  const source = sharp(bytes, { limitInputPixels: 50_000_000 }).rotate();
  let trimmed;
  try {
    trimmed = await source.clone().trim({ threshold: 12 }).png().toBuffer();
  } catch {
    trimmed = await source.clone().png().toBuffer();
  }
  const { data, info } = await sharp(trimmed)
    .resize(640, 640, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) return null;
  return { src: `data:image/png;base64,${data.toString("base64")}`, aspect: info.width / info.height };
}

/** `url` was already limited to our public business-logos path by the props builder. */
function makeLogoLoader(sniffLogoType) {
  return async (url) => {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? "0") > MAX_LOGO_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_LOGO_BYTES || !sniffLogoType(bytes)) return null;
    return normaliseLogo(bytes);
  };
}

function createRenderer({ serveUrl, browserExecutable, compositionId, posterFrame }) {
  const { openBrowser, selectComposition, renderMedia, renderStill, makeCancelSignal } = require("@remotion/renderer");
  return {
    async render(props, outDir, signal) {
      if (signal.aborted) throw new Error("aborted");
      const { cancelSignal, cancel } = makeCancelSignal();
      const onAbort = () => cancel();
      signal.addEventListener("abort", onAbort, { once: true });
      const browser = await openBrowser("chrome", { browserExecutable, logLevel: "error" });
      try {
        const common = {
          serveUrl,
          inputProps: props,
          puppeteerInstance: browser,
          browserExecutable,
          timeoutInMilliseconds: PAGE_TIMEOUT_MS,
          logLevel: "error",
        };
        const composition = await selectComposition({ ...common, id: compositionId });
        if (signal.aborted) throw new Error("aborted");
        const videoPath = path.join(outDir, "video.mp4");
        const posterPath = path.join(outDir, "poster.jpg");
        await renderMedia({
          ...common,
          composition,
          codec: "h264",
          crf: 23,
          x264Preset: "medium",
          pixelFormat: "yuv420p",
          colorSpace: "bt709",
          imageFormat: "jpeg",
          jpegQuality: 90,
          concurrency: 1,
          muted: true,
          enforceAudioTrack: false,
          outputLocation: videoPath,
          overwrite: true,
          cancelSignal,
        });
        await renderStill({
          ...common,
          composition,
          output: posterPath,
          frame: posterFrame,
          imageFormat: "jpeg",
          jpegQuality: 82,
          overwrite: true,
          cancelSignal,
        });
        return { videoPath, posterPath };
      } finally {
        signal.removeEventListener("abort", onAbort);
        await browser.close({ silent: true }).catch(() => undefined);
      }
    },
  };
}

/** True when the MP4's `moov` box precedes `mdat`, so phones can start playing before the download ends. */
function isFaststart(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(16);
    const order = [];
    for (let offset = 0; offset < size && order.length < 12; ) {
      fs.readSync(fd, head, 0, 16, offset);
      let box = head.readUInt32BE(0);
      if (box === 1) box = Number(head.readBigUInt64BE(8));
      if (box < 8) break;
      order.push(head.toString("latin1", 4, 8));
      offset += box;
    }
    const moov = order.indexOf("moov");
    const mdat = order.indexOf("mdat");
    return moov >= 0 && mdat >= 0 && moov < mdat;
  } finally {
    fs.closeSync(fd);
  }
}

async function renderSample({ dirArg, renderer }) {
  const sample = await loadTs("src/lib/quote-video/sample.ts");
  const dir = dirArg ? path.resolve(process.cwd(), dirArg) : await fsp.mkdtemp(path.join(os.tmpdir(), "t2q-video-sample-"));
  await fsp.mkdir(dir, { recursive: true });
  const props = sample.sampleQuoteVideoProps();
  // The built-in sample logo is our own SVG; uploaded logos are PNG/JPEG only.
  const logo = await normaliseLogo(Buffer.from(sample.SAMPLE_LOGO_SVG));
  props.logoSrc = logo?.src ?? null;
  props.logoAspect = logo?.aspect ?? null;
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), "t2q-video-job-"));
  try {
    const started = Date.now();
    const files = await renderer.render(props, work, new AbortController().signal);
    const renderMs = Date.now() - started;
    const video = path.join(dir, "quote-video-sample.mp4");
    const poster = path.join(dir, "quote-video-sample.jpg");
    await fsp.copyFile(files.videoPath, video);
    await fsp.copyFile(files.posterPath, poster);
    const { getVideoMetadata } = require("@remotion/renderer");
    const meta = await getVideoMetadata(video, { logLevel: "error" }).catch(() => null);
    log("sample.ready", {
      video,
      poster,
      render_ms: renderMs,
      bytes: fs.statSync(video).size,
      poster_bytes: fs.statSync(poster).size,
      duration_s: meta?.durationInSeconds ?? null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      fps: meta?.fps ?? null,
      codec: meta?.codec ?? null,
      faststart: isFaststart(video),
    });
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return 0;
  }
  const { ensureBrowser } = require("@remotion/renderer");
  const { bundle } = require("@remotion/bundler");
  const browserExecutable = process.env.T2Q_RENDER_BROWSER || null;
  let browser;
  try {
    browser = await ensureBrowser({ browserExecutable, logLevel: "error" });
  } catch (error) {
    if (args.ensureBrowser) throw error;
    // Under systemd the app folder is read-only, so the browser cannot be fetched here.
    throw new Error(
      `Chrome Headless Shell is not available (${error instanceof Error ? error.message.slice(0, 160) : "unknown"}). ` +
        'Run "node scripts/quote-video-worker.mjs --ensure-browser" as the deploy user in the app folder, or set T2Q_RENDER_BROWSER.',
    );
  }
  log("browser.ready", { source: browser.type });
  if (args.ensureBrowser) return 0;

  const constants = await loadTs("src/lib/quote-video/constants.ts");
  const worker = await loadTs("src/lib/quote-video/worker.ts");

  // Everything this process writes lives under one temp folder, removed on exit.
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "t2q-video-"));
  try {
    const publicDir = path.join(tmpRoot, "public");
    await fsp.mkdir(publicDir);
    const bundleStarted = Date.now();
    const serveUrl = await bundle({
      entryPoint: path.join(ROOT, "src/remotion/index.tsx"),
      outDir: path.join(tmpRoot, "bundle"),
      // An empty public folder: the composition needs no static files, and the
      // default would copy the whole site's public/ into every bundle.
      publicDir,
      rootDir: ROOT,
      enableCaching: false,
      onProgress: () => undefined,
    });
    log("bundle.ready", { ms: Date.now() - bundleStarted });

    const renderer = createRenderer({
      serveUrl,
      browserExecutable,
      compositionId: constants.QUOTE_VIDEO_COMPOSITION.id,
      posterFrame: constants.QUOTE_VIDEO_POSTER_FRAME,
    });
    if (args.sample !== null) {
      await renderSample({ dirArg: args.sample, renderer });
      return 0;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    const { createClient } = require("@supabase/supabase-js");
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const stop = new AbortController();
    const onSignal = (signal) => {
      if (stop.signal.aborted) return;
      log("worker.stopping", { signal });
      stop.abort();
    };
    process.once("SIGTERM", () => onSignal("SIGTERM"));
    process.once("SIGINT", () => onSignal("SIGINT"));

    log("worker.start", { once: args.once, poll_ms: POLL_MS });
    const last = await worker.runQuoteVideoWorker(
      {
        db,
        renderer,
        loadLogo: makeLogoLoader(worker.sniffLogoType),
        files: {
          makeTempDir: () => fsp.mkdtemp(path.join(tmpRoot, "job-")),
          readFile: (file) => fsp.readFile(file),
          removeDir: (dir) => fsp.rm(dir, { recursive: true, force: true }),
        },
        log,
        now: () => Date.now(),
        supabaseUrl,
        renderTimeoutMs: RENDER_TIMEOUT_MS,
      },
      { pollMs: POLL_MS, errorBackoffMs: ERROR_BACKOFF_MS, once: args.once, stopSignal: stop.signal, sleep },
    );
    const outcome = typeof last === "string" ? last : last.kind;
    log("worker.stopped", { last: outcome });
    return args.once && (outcome === "failed" || outcome === "retry" || outcome === "lost") ? 1 : 0;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

process.on("unhandledRejection", (reason) => {
  log("worker.crash", { err: reason instanceof Error ? reason.name : "Error" });
  process.exit(1);
});

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    // Start-up failures only (browser, bundle, configuration): no quote data is loaded yet.
    log("worker.failed", { message: error instanceof Error ? error.message.slice(0, 300) : "Unknown error" });
    process.exitCode = 1;
  },
);
