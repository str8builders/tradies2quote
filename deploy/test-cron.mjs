import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCron } from './run-cron.mjs';
const env = { CRON_SECRET: 'test-only-'.repeat(6) };
test('only fixed loopback cron jobs can receive the bearer token', async () => {
  let called = false;
  const fetchImpl = async (url, options) => {
    called = true;
    assert.equal(url, 'http://127.0.0.1:3001/api/cron/trial-emails?dry_run=1');
    assert.equal(options.headers.Authorization, `Bearer ${env.CRON_SECRET}`);
    assert.equal(options.redirect, 'error');
    return Response.json({ ok: true, dryRun: true });
  };
  await assert.rejects(runCron('../external', { env, fetchImpl }));
  assert.equal(called, false);
  assert.deepEqual(await runCron('trial-emails', { env, fetchImpl, dryRun: true }), { job: 'trial-emails', dryRun: true, success: true });
});
test('missing and weak cron credentials fail before a request', async () => {
  await assert.rejects(runCron('error-digest', { env: {}, fetchImpl: () => assert.fail('must not send') }));
});
test('application failures and disabled wiring cannot look successful to systemd', async () => {
  for (const body of [{ ok: false }, { ok: true, failed: 1 }, { ok: true, skipped: 'flags_off' }, { ok: true, reason: 'email_not_configured' }]) {
    await assert.rejects(runCron('engagement', { env, fetchImpl: async () => Response.json(body) }));
  }
  await assert.rejects(runCron('error-digest', { env, fetchImpl: async () => new Response('secret details', { status: 500 }) }));
  await runCron('error-digest', { env, fetchImpl: async () => Response.json({ ok: true, reason: 'no_errors' }) });
});
