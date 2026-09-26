#!/usr/bin/env node
/**
 * Renders the Tradies2Quote marketing videos and stills with Remotion.
 *
 *   npm run render:marketing                          # everything
 *   npm run render:marketing -- --only=demo-wide,hero-loop
 *   npm run render:marketing -- --list                # show targets
 *
 * Website files (committed, always muted):
 *   public/videos/demo-wide.{mp4,webm}   DemoWide, 1920×1080
 *   public/videos/demo-tall.{mp4,webm}   DemoTall, 1080×1920
 *   public/videos/hero-loop.{mp4,webm}   HeroLoop, 720×1440 seamless loop
 *   public/images/marketing/poster-{demo-wide,demo-tall,hero}.webp
 *   public/images/marketing/feature-*.webp  (960×1200)
 *   public/jobsite/screens/<step>.{mp4,webm}   StepScreen per step (Talk … Invoice),
 *     the 3D phone's screen on the job-site website, 600 px wide, plus
 *     <step>-first.webp (its first frame) and <step>.webp (the finished screen)
 * Sharing files (marketing-media/, git-ignored):
 *   social-15s.mp4, full-tour.mp4, demo-wide.mp4, demo-tall.mp4
 *
 * Re-rendering with the owner's voice
 * -----------------------------------
 * Every composition takes an optional `voiceoverSrc` prop. There is no
 * text-to-speech: record your own narration (m4a, mp3 or wav) per video,
 * timed to the captions in src/remotion/demo-script.ts, then pass it with
 * --props. A local file is copied into a temporary public folder for the
 * render; an https URL is used as is. Without it there is no audio track.
 *
 *   npm run render:marketing -- --only=full-tour --props='{"voiceoverSrc":"./voice/full-tour.m4a"}'
 *   npm run render:marketing -- --only=social --props='{"voiceoverSrc":"./voice/social-15s.m4a"}'
 *
 * The sharing MP4s in marketing-media/ then carry the voice. The website
 * videos stay muted (they autoplay silently), so re-rendering them with a
 * voiceover changes nothing on the site.
 *
 * Fonts come from Google Fonts at render time (@remotion/google-fonts), so a
 * render needs network access; it fails instead of falling back to system
 * fonts. The first run also downloads Chrome Headless Shell unless --browser
 * points at one.
 *
 * Options:
 *   --only=<ids>         comma-separated targets (see --list)
 *   --props=<json>       input props for the selected compositions
 *   --concurrency=<n>    browser tabs rendering in parallel (default: half the CPUs)
 *   --browser=<path>     Chrome/Chrome Headless Shell to use instead of the one
 *                        Remotion downloads (also: T2Q_RENDER_BROWSER)
 *   --keep-temp          keep the bundle and the lossless masters
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { bundle } = require("@remotion/bundler");
const { ensureBrowser, renderMedia, renderStill, selectComposition, RenderInternals } = require("@remotion/renderer");
const sharp = require("sharp");

const VIDEOS = "public/videos";
const IMAGES = "public/images/marketing";
const SHARE = "marketing-media";

/**
 * What each target renders. Poster frames point at the end of the "Draft
 * builds itself" chapter (frames 180-359 in DEMO_TIMELINE), where the quote
 * total and the caption are both on screen; the hero poster is frame 0 so
 * playback starts without a jump.
 */
const TARGETS = {
  "demo-wide": {
    composition: "DemoWide",
    web: { name: "demo-wide", mp4Crf: 30, webmCrf: 42, gop: 90 },
    share: "demo-wide.mp4",
    poster: { file: "poster-demo-wide.webp", frame: 348, maxBytes: 160_000 },
  },
  "demo-tall": {
    composition: "DemoTall",
    web: { name: "demo-tall", mp4Crf: 30, webmCrf: 42, gop: 90 },
    share: "demo-tall.mp4",
    poster: { file: "poster-demo-tall.webp", frame: 348, maxBytes: 160_000 },
  },
  "hero-loop": {
    composition: "HeroLoop",
    web: { name: "hero-loop", mp4Crf: 23, webmCrf: 33, gop: 270 },
    poster: { file: "poster-hero.webp", frame: 0, maxBytes: 120_000 },
  },
  social: { composition: "SocialCut", share: "social-15s.mp4" },
  "full-tour": { composition: "FullTour", share: "full-tour.mp4" },
  stills: {
    composition: "FeatureStill",
    stills: ["voice", "supplier-scan", "qr-request", "client-accept", "numbers", "invoices"],
  },
  steps: {
    composition: "StepScreen",
    steps: ["talk", "draft", "check", "send", "invoice"],
    dir: "public/jobsite/screens",
    // H.264 only: phones decode it in hardware, and the 3D phone uploads
    // every frame as a texture. 600 px for computers, 420 px for phones.
    web: { widths: [600, 420], mp4Crf: 26, gop: 60, stillWidth: 600 },
  },
};

function parseArgs(argv) {
  const out = { only: null, props: {}, concurrency: null, browser: null, keepTemp: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [key, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, null];
    const value = () => inline ?? argv[++i];
    if (key === "--only") out.only = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "--props") out.props = JSON.parse(value());
    else if (key === "--concurrency") out.concurrency = Number(value());
    else if (key === "--browser") out.browser = value();
    else if (key === "--keep-temp") out.keepTemp = true;
    else if (key === "--list") out.list = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  return out;
}

/**
 * Remotion's masters are full-range BT.601 (decoded JPEG frames). Web files
 * are converted to standard limited-range BT.709 yuv420p and tagged as such.
 */
const COLOR_SCALE = "in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709";
const WEB_COLOR = [
  "-vf",
  `scale=${COLOR_SCALE}`,
  "-pix_fmt",
  "yuv420p",
  "-color_range",
  "tv",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
];
/** WEB_COLOR that also resizes to `width` (one -vf: a second one would replace the first). */
const webColorAt = (width) => WEB_COLOR.map((arg) => (arg === `scale=${COLOR_SCALE}` ? `scale=${width}:-2:flags=lanczos:${COLOR_SCALE}` : arg));

const log = (...args) => console.log("[render-marketing]", ...args);
const rel = (file) => path.relative(ROOT, file);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function ff(args) {
  await RenderInternals.callFf({
    bin: "ffmpeg",
    args: ["-hide_banner", "-loglevel", "error", ...args],
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
    cancelSignal: undefined,
  });
}

/** Top-level MP4 boxes must put `moov` before `mdat` so playback can start before the download ends. */
function assertFaststart(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(16);
    let offset = 0;
    const order = [];
    while (offset < size && order.length < 12) {
      fs.readSync(fd, head, 0, 16, offset);
      let boxSize = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (boxSize === 1) boxSize = Number(head.readBigUInt64BE(8));
      if (boxSize < 8) break;
      order.push(type);
      offset += boxSize;
    }
    const moov = order.indexOf("moov");
    const mdat = order.indexOf("mdat");
    if (moov < 0 || mdat < 0 || moov > mdat) throw new Error(`${rel(file)} is not faststart (boxes: ${order.join(", ")})`);
  } finally {
    fs.closeSync(fd);
  }
}

/** Encodes a still to WebP at the highest quality that fits `maxBytes`. */
async function toWebp(png, out, maxBytes) {
  for (let quality = 84; quality >= 50; quality -= 4) {
    const buffer = await sharp(png).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    if (buffer.length <= maxBytes || quality <= 50) {
      fs.writeFileSync(out, buffer);
      return { bytes: buffer.length, quality };
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const [id, t] of Object.entries(TARGETS)) log(id.padEnd(10), "→", t.composition);
    return;
  }
  const selected = args.only ?? Object.keys(TARGETS);
  for (const id of selected) if (!TARGETS[id]) throw new Error(`Unknown target "${id}". Use --list.`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t2q-marketing-"));
  const publicDir = path.join(tmp, "public");
  fs.mkdirSync(publicDir, { recursive: true });

  // A local voiceover file is copied next to the bundle and referenced by name.
  const inputProps = { ...args.props };
  if (typeof inputProps.voiceoverSrc === "string" && !/^(https?:|data:|blob:)/.test(inputProps.voiceoverSrc)) {
    const source = path.resolve(process.cwd(), inputProps.voiceoverSrc);
    if (!fs.existsSync(source)) throw new Error(`voiceoverSrc not found: ${source}`);
    const name = `voiceover${path.extname(source) || ".m4a"}`;
    fs.copyFileSync(source, path.join(publicDir, name));
    inputProps.voiceoverSrc = name;
    log("voiceover:", source);
  }
  const hasVoice = typeof inputProps.voiceoverSrc === "string" && inputProps.voiceoverSrc.length > 0;

  const browserExecutable = args.browser ?? process.env.T2Q_RENDER_BROWSER ?? null;
  if (!browserExecutable) await ensureBrowser();
  const concurrency = args.concurrency ?? Math.max(1, Math.floor(os.cpus().length / 2));
  const common = { browserExecutable, logLevel: "warn" };

  log("bundling src/remotion/index.tsx …");
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src/remotion/index.tsx"), publicDir, onProgress: () => undefined });

  for (const dir of [VIDEOS, IMAGES, SHARE]) fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  const written = [];

  try {
    for (const id of selected) {
      const target = TARGETS[id];
      if (target.stills) {
        for (const feature of target.stills) {
          // Props are resolved when the composition is selected, so select once per still.
          const composition = await selectComposition({ serveUrl, id: target.composition, inputProps: { feature }, ...common });
          const png = path.join(tmp, `feature-${feature}.png`);
          await renderStill({ composition, serveUrl, output: png, frame: 0, inputProps: { feature }, imageFormat: "png", ...common });
          const out = path.join(ROOT, IMAGES, `feature-${feature}.webp`);
          const { bytes, quality } = await toWebp(png, out, 118_000);
          written.push(out);
          log(`${rel(out)}  ${kb(bytes)} (q${quality})`);
        }
        continue;
      }

      if (target.steps) {
        const dir = path.join(ROOT, target.dir);
        fs.mkdirSync(dir, { recursive: true });
        for (const step of target.steps) {
          const props = { step };
          const composition = await selectComposition({ serveUrl, id: target.composition, inputProps: props, ...common });
          const master = path.join(tmp, `step-${step}-master.mp4`);
          await renderMedia({
            composition, serveUrl, codec: "h264", crf: 10, pixelFormat: "yuv444p", imageFormat: "jpeg", jpegQuality: 95,
            outputLocation: master, inputProps: props, muted: true, enforceAudioTrack: false, concurrency, ...common,
          });
          const { widths, mp4Crf, gop, stillWidth } = target.web;
          const sizes = [];
          for (const width of widths) {
            const mp4 = path.join(dir, `${step}-${width}.mp4`);
            await ff(["-y", "-i", master, "-an", ...webColorAt(width), "-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-crf", String(mp4Crf), "-profile:v", "high", "-g", String(gop), "-movflags", "+faststart", mp4]);
            assertFaststart(mp4);
            written.push(mp4);
            sizes.push(`${rel(mp4)}  ${kb(fs.statSync(mp4).size)}`);
          }
          for (const [frame, name] of [[0, `${step}-first.webp`], [composition.durationInFrames - 1, `${step}.webp`]]) {
            const png = path.join(tmp, `step-${step}-${frame}.png`);
            await renderStill({ composition, serveUrl, output: png, frame, inputProps: props, imageFormat: "png", scale: stillWidth / composition.width, ...common });
            const out = path.join(dir, name);
            await toWebp(png, out, 90_000);
            written.push(out);
          }
          log(sizes.join(" · "));
        }
        continue;
      }

      const composition = await selectComposition({ serveUrl, id: target.composition, inputProps, ...common });
      log(`${target.composition}: ${composition.width}×${composition.height}, ${composition.durationInFrames} frames`);

      if (target.poster) {
        const png = path.join(tmp, `${id}-poster.png`);
        await renderStill({ composition, serveUrl, output: png, frame: target.poster.frame, inputProps, imageFormat: "png", ...common });
        const out = path.join(ROOT, IMAGES, target.poster.file);
        const { bytes, quality } = await toWebp(png, out, target.poster.maxBytes);
        written.push(out);
        log(`${rel(out)}  ${kb(bytes)} (q${quality})`);
      }

      // One near-lossless master per composition; every delivery file is encoded from it.
      const master = path.join(tmp, `${id}-master.mp4`);
      let last = -1;
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        crf: 10,
        pixelFormat: "yuv444p",
        imageFormat: "jpeg",
        jpegQuality: 95,
        outputLocation: master,
        inputProps,
        muted: !hasVoice,
        enforceAudioTrack: false,
        concurrency,
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 10) * 10;
          if (pct !== last) {
            last = pct;
            process.stdout.write(`\r[render-marketing] ${target.composition} ${pct}%   `);
          }
        },
        ...common,
      });
      process.stdout.write("\n");

      if (target.web) {
        const { name, mp4Crf, webmCrf, gop } = target.web;
        const mp4 = path.join(ROOT, VIDEOS, `${name}.mp4`);
        await ff(["-y", "-i", master, "-an", ...WEB_COLOR, "-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-crf", String(mp4Crf), "-profile:v", "high", "-g", String(gop), "-movflags", "+faststart", mp4]);
        assertFaststart(mp4);
        const webm = path.join(ROOT, VIDEOS, `${name}.webm`);
        await ff(["-y", "-i", master, "-an", ...WEB_COLOR, "-c:v", "libvpx-vp9", "-crf", String(webmCrf), "-b:v", "0", "-row-mt", "1", "-tile-columns", "2", "-deadline", "good", "-cpu-used", "2", "-g", String(gop), webm]);
        written.push(mp4, webm);
        log(`${rel(mp4)}  ${mb(fs.statSync(mp4).size)}`);
        log(`${rel(webm)}  ${mb(fs.statSync(webm).size)}`);
      }
      if (target.share) {
        const out = path.join(ROOT, SHARE, target.share);
        const audio = hasVoice ? ["-c:a", "aac", "-b:a", "160k"] : ["-an"];
        await ff(["-y", "-i", master, ...WEB_COLOR, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-movflags", "+faststart", ...audio, out]);
        assertFaststart(out);
        written.push(out);
        log(`${rel(out)}  ${mb(fs.statSync(out).size)}${hasVoice ? " (with voiceover)" : ""}`);
      }
    }
  } finally {
    if (!args.keepTemp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(serveUrl, { recursive: true, force: true });
    } else {
      log("kept temp files in", tmp, "and", serveUrl);
    }
  }

  const web = written.filter((f) => f.includes(`${path.sep}public${path.sep}`));
  const total = web.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  if (web.length) log(`website media written this run: ${mb(total)}`);
}

main().catch((error) => {
  console.error("[render-marketing] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
