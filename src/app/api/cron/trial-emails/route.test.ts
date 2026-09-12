import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ configured: true, status: vi.fn(), from: vi.fn(), listUsers: vi.fn(), send: vi.fn(), calls: [] as string[], dbError: false }));
vi.mock('@/lib/observability', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({ from: mock.from, auth: { admin: { listUsers: mock.listUsers } } }) }));
vi.mock('@/lib/subscription', () => ({ getSubscriptionStatus: mock.status }));
vi.mock('@/lib/stripe-client', () => ({ isStripeConfigured: () => mock.configured }));
vi.mock('@/lib/trial-emails', async (original) => ({ ...await original<typeof import('@/lib/trial-emails')>(), sendTrialEmail: mock.send }));
import { POST } from './route';
const request = (dry = false) => new NextRequest(`https://tradies2quote.com/api/cron/trial-emails${dry ? '?dry_run=1' : ''}`, { method: 'POST', headers: { authorization: `Bearer ${'test-only-'.repeat(6)}` } });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));
  vi.stubEnv('CRON_SECRET', 'test-only-'.repeat(6));
  mock.configured = true; mock.calls = []; mock.dbError = false;
  // An old signup with a restarted trial: the app's actual trial date wins.
  mock.listUsers.mockResolvedValue({ data: { users: [{ id: 'user_1', email: 'fixture@example.invalid', created_at: '2026-01-01T00:00:00Z' }] }, error: null });
  mock.status.mockResolvedValue({ state: 'trialing', trialEndsAt: new Date('2026-09-15T00:00:00Z') });
  mock.send.mockResolvedValue({ ok: true, messageId: 'message-test' });
  mock.from.mockImplementation((table: string) => {
    let op = 'select';
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'insert']) query[method] = () => { if (method === 'insert') op = 'insert'; return query; };
    const result = () => { mock.calls.push(`${table}.${op}`); return { data: null, count: 0, error: mock.dbError ? { message: 'DB unavailable' } : null }; };
    query.maybeSingle = async () => result(); query.then = (resolve: (v: unknown) => void) => resolve(result());
    return query;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('trial email scheduler safeguards', () => {
  it('does not send expiry warnings while billing is unconfigured', async () => {
    mock.configured = false;
    expect(await (await POST(request())).json()).toMatchObject({ skipped: 'billing_not_configured' });
    expect(mock.listUsers).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled();
  });
  it('uses the effective trial anchor and a stable provider idempotency key', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'trial/user_1/trial_minus_2/2026-09-08T00:00:00.000Z' }));
  });
  it('preview scans eligibility without sending or writing a ledger', async () => {
    const body = await (await POST(request(true))).json();
    expect(body).toMatchObject({ ok: true, dryRun: true, windowed: 1, sent: 0 });
    expect(mock.send).not.toHaveBeenCalled(); expect(mock.calls.some(c => c.endsWith('.insert'))).toBe(false);
  });
  it('skips users with paid, owner, comped or beta access', async () => {
    mock.status.mockResolvedValue({ state: 'paid', trialEndsAt: new Date('2026-09-15T00:00:00Z') });
    expect((await POST(request())).status).toBe(200); expect(mock.send).not.toHaveBeenCalled();
  });
  it('surfaces DB errors to the scheduler instead of pretending the run succeeded', async () => {
    mock.dbError = true;
    expect((await POST(request())).status).toBe(502); expect(mock.send).not.toHaveBeenCalled();
  });
});
