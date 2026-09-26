#!/usr/bin/env node
/**
 * Records the real T2QCAL at phone size for the job-site website's T2QCAL
 * stop (the floating phone plays it, then Remotion adds the draft quote the
 * hand-off makes; see src/remotion/marketing/t2qcal-screen.tsx).
 *
 *   node scripts/record-t2qcal.mjs            # the live public T2QCAL
 *   BASE=http://localhost:3000 node scripts/record-t2qcal.mjs
 *
 * What it records, signed out (calculators work without an account):
 *   the Deck subframe at 6,000 × 3,600 → the width typed to 4,000 → the
 *   drawing redrawn at 24 m² → "Use in Tradies2Quote" filled in with the
 *   example job (Decking & fixings, 24 m², $110, Sam Taylor) → the tap on
 *   "Create quote draft". The draft itself needs a login, so the recording
 *   stops at the tap and Remotion shows the app's draft.
 *
 * Frames come from the browser's own screencast (390 × 790 at 2×: the phone
 * screen below the status bar) and are joined with Remotion's ffmpeg into
 * src/remotion/marketing/media/t2qcal-deck.mp4.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "https://tradies2quote.com";
const OUT = path.join(ROOT, "src/remotion/marketing/media/t2qcal-deck.mp4");
const FFMPEG_DIR = path.join(ROOT, "node_modules/@remotion/compositor-darwin-arm64");
const VIEW = { width: 390, height: 790 };

const pause = (page, ms) => page.waitForTimeout(ms);
const glide = (page, top) =>
  page.evaluate(
    (top) =>
      new Promise((done) => {
        window.scrollTo({ top, behavior: "smooth" });
        setTimeout(done, 900);
      }),
    top,
  );
/** The calculator's own fields are named with their unit ("Deck widthmm"); the hand-off fields exactly. */
const field = (page, label) => (label.startsWith("Deck ") ? page.getByLabel(label) : page.getByLabel(label, { exact: true }));
/** Page y that puts a field `offset` px below the top of the screen. */
const yOf = (page, label, offset) =>
  field(page, label).evaluate((el, offset) => el.getBoundingClientRect().top + window.scrollY - offset, offset);

// Headless screencasts come at one pixel per CSS pixel unless the scale is forced.
const browser = await chromium.launch({ headless: true, args: ["--force-device-scale-factor=2"] });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.goto(`${BASE}/t2qcal/calculator/deck-subframe`, { waitUntil: "load", timeout: 120_000 });
// A throwaway session: take the privacy-preserving choice so the banner is out of shot.
await page.getByRole("button", { name: "Decline" }).click({ timeout: 10_000 }).catch(() => {});
const width = field(page, "Deck width");
await width.fill("3600");
await width.blur();
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await pause(page, 1500);

const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  frames.push({ data, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: VIEW.width * 2, maxHeight: VIEW.height * 2, everyNthFrame: 1 });
// Nudge a repaint so the first frame arrives straight away.
await page.evaluate(() => window.scrollBy(0, 1));
await pause(page, 1400);

// Change the width and watch the drawing follow.
await glide(page, await yOf(page, "Deck width", 260));
await width.tap();
await width.selectText();
await width.pressSequentially("4000", { delay: 140 });
await width.blur();
await pause(page, 300);
await glide(page, 0);
await pause(page, 1600);

// Send it to Tradies2Quote.
await glide(page, await yOf(page, "Material description", 140));
const fill = async (label, text, delay = 45) => {
  const input = field(page, label);
  await input.tap();
  await input.pressSequentially(text, { delay });
};
await fill("Material description", "Decking & fixings");
await fill("Quantity", "24", 90);
await fill("Unit", "m²", 90);
await fill("Unit price before tax", "110", 90);
await glide(page, await yOf(page, "Client name (optional)", 330));
await fill("Client name (optional)", "Sam Taylor");
await field(page, "Client name (optional)").blur();
await pause(page, 500);
const create = page.getByRole("button", { name: "Create quote draft" });
await create.hover();
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Create quote draft"));
  if (button) button.style.filter = "brightness(1.15)";
});
await pause(page, 700);
await cdp.send("Page.stopScreencast");
await browser.close();

if (frames.length < 10) throw new Error(`only ${frames.length} frames recorded`);
const dir = mkdtempSync(path.join(tmpdir(), "t2qcal-rec-"));
let list = "";
frames.forEach((f, i) => {
  const name = `${String(i).padStart(5, "0")}.jpg`;
  writeFileSync(path.join(dir, name), Buffer.from(f.data, "base64"));
  const next = frames[i + 1]?.t ?? f.t + 0.5;
  list += `file '${name}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
});
list += `file '${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
writeFileSync(path.join(dir, "list.txt"), list);
mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync(
  path.join(FFMPEG_DIR, "ffmpeg"),
  ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-r", "30", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
  { cwd: dir, env: { ...process.env, DYLD_LIBRARY_PATH: FFMPEG_DIR }, stdio: "inherit" },
);
rmSync(dir, { recursive: true, force: true });
console.log(`recorded ${frames.length} frames over ${(frames[frames.length - 1].t - frames[0].t).toFixed(1)} s → ${path.relative(ROOT, OUT)}`);
