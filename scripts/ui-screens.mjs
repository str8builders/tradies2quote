// Screenshots of the redesign's parts kit (/ui-kit) for review.
//
//   node scripts/ui-screens.mjs [baseUrl]      default http://localhost:3000
//
// Captures the whole page at phone (390×844) and laptop (1280×800) size, in
// the default and the outdoor palette, plus each example phone screen on its
// own, into the git-ignored ui-screens/ folder. Reduced motion is on so every
// capture is steady. The cookie notice is declined first so it never covers
// the page. Fails (exit 1) on a page error, a wrong palette or sideways scroll
// at phone width.
//
// Uses Playwright's own Chromium (npx playwright install chromium), or set
// UI_SCREENS_CHROME to a Chrome binary.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const outDir = resolve(process.cwd(), "ui-screens");
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
];
const MODES = ["default", "outdoor"];
const SCREENS = ["screen-home", "screen-record", "screen-job", "screen-price"];

async function launch() {
  const executablePath = process.env.UI_SCREENS_CHROME;
  try {
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (error) {
    if (executablePath) throw error;
    // No Playwright browser installed: fall back to the system Chrome.
    return chromium.launch({ channel: "chrome" });
  }
}

async function openKit(browser, viewport, mode, deviceScaleFactor) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  if (mode === "outdoor") {
    await context.addCookies([{ name: "t2q-outdoor", value: "1", url: base }]);
  }
  await context.addInitScript(() => {
    try {
      localStorage.setItem("t2q-cookie-consent", "declined");
    } catch {
      /* storage blocked */
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${base}/ui-kit`, { waitUntil: "networkidle", timeout: 180_000 });
  if (!response || !response.ok()) {
    throw new Error(`GET ${base}/ui-kit answered ${response ? response.status() : "nothing"}`);
  }
  await page.evaluate(() => document.fonts.ready);
  const contrast = await page.locator("[data-contrast-root]").first().getAttribute("data-contrast");
  if ((contrast === "outdoor") !== (mode === "outdoor")) {
    throw new Error(`${mode}: page rendered data-contrast=${contrast ?? "(none)"}`);
  }
  return { context, page, errors };
}

await mkdir(outDir, { recursive: true });
const browser = await launch();
const written = [];
const problems = [];
try {
  for (const viewport of VIEWPORTS) {
    for (const mode of MODES) {
      const { context, page, errors } = await openKit(browser, viewport, mode, 1);
      if (viewport.name === "phone") {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) problems.push(`${mode} phone: page scrolls sideways by ${overflow}px`);
      }
      const file = `ui-kit-${viewport.width}x${viewport.height}-${mode}.png`;
      await page.screenshot({ path: resolve(outDir, file), fullPage: true });
      written.push(file);
      problems.push(...errors.map((message) => `${mode} ${viewport.name}: page error: ${message}`));
      await context.close();
    }
  }

  // Each example screen on its own, sharp (2x), at phone width.
  for (const mode of MODES) {
    const { context, page, errors } = await openKit(browser, VIEWPORTS[0], mode, 2);
    // The kit's sticky header would sit over the top of each phone frame.
    await page.addStyleTag({ content: "[data-kit-header]{position:static!important}" });
    for (const id of SCREENS) {
      const frame = page.locator(`[data-screenshot="${id}"]`);
      await frame.scrollIntoViewIfNeeded();
      const file = `${id}-${mode}.png`;
      await frame.screenshot({ path: resolve(outDir, file) });
      written.push(file);
    }
    problems.push(...errors.map((message) => `${mode} screens: page error: ${message}`));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`Saved ${written.length} screenshots to ${outDir}:`);
for (const file of written) console.log(`  ${file}`);
if (problems.length) {
  console.error("Problems:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
