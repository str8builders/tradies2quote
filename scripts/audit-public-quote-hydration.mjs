// Owner-run read-only browser check. Set T2Q_PUBLIC_QUOTE_URL to a quote the
// owner authorizes for inspection; the report redacts its bearer token.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = process.env.T2Q_PUBLIC_QUOTE_URL;
if (!target) throw new Error('Set T2Q_PUBLIC_QUOTE_URL to the owner-provided public quote URL.');
const url = new URL(target);
if (url.origin !== 'https://tradies2quote.com' || !/^\/quote\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error('Expected a Tradies2Quote public quote URL.');
const token = url.pathname.split('/').at(-1);
const redact = (value) => String(value).replaceAll(token, '[redacted]');
const output = resolve(process.env.T2Q_HYDRATION_OUTPUT || 'work/hydration-audit');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const timezoneId of ['Pacific/Auckland', 'Europe/Berlin']) {
    const context = await browser.newContext({ timezoneId, locale: 'en-NZ', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push({ source: 'console', message: redact(msg.text()) }); });
    page.on('pageerror', error => errors.push({ source: 'pageerror', message: redact(error.message) }));
    const response = await page.goto(url.href, { waitUntil: 'networkidle', timeout: 45_000 });
    // Allow effects and late client chunks to run; do not accept, message or
    // change the quote. Public page opening can record its usual view event.
    await page.waitForTimeout(3_000);
    const result = {
      at: new Date().toISOString(), timezoneId,
      browserTimezone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      status: response?.status(), route: '/quote/[redacted]',
      quoteVisible: await page.getByTestId('public-quote-summary').isVisible(),
      errors, hydrationErrors: errors.filter(e => /#418|hydration|hydrating/i.test(e.message)),
    };
    await page.screenshot({ path: resolve(output, timezoneId.replace('/', '-') + '.png'), fullPage: true });
    results.push(result);
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
if (results.some(r => r.status !== 200 || !r.quoteVisible || r.errors.length)) process.exitCode = 1;
