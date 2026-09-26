#!/usr/bin/env node
// Load app.env via systemd. Never expose credentials or customer records in logs.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const JOBS = new Set(['trial-emails', 'engagement', 'weekly-digest', 'error-digest', 'location-purge']);
export async function runCron(job, { dryRun = false, env = process.env, fetchImpl = fetch } = {}) {
  if (!JOBS.has(job)) throw new Error('Unknown scheduled job.');
  if ((env.CRON_SECRET?.length ?? 0) < 32) throw new Error('CRON_SECRET is missing or too short.');
  const response = await fetchImpl(`http://127.0.0.1:3001/api/cron/${job}${dryRun ? '?dry_run=1' : ''}`, {
    method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(29 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Scheduled job returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.ok !== true || result.failed > 0 || result.skipped || result.reason === 'email_not_configured') {
    throw new Error('Scheduled job reported failures or missing configuration.');
  }
  return { job, dryRun, success: true };
}
export async function main(args = process.argv.slice(2)) {
  try {
    if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== '--dry-run')) throw new Error('Usage: run-cron.mjs JOB [--dry-run]');
    console.log(JSON.stringify(await runCron(args[0], { dryRun: args[1] === '--dry-run' })));
    return 0;
  } catch (error) {
    // No response body or underlying fetch error: they can contain personal data.
    console.error(error instanceof Error && /^(Unknown|CRON_SECRET|Scheduled job|Usage:)/.test(error.message) ? error.message : 'Scheduled job request failed.');
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
