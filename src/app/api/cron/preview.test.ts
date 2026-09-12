import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ weekly: vi.fn(), errors: vi.fn(), from: vi.fn(), followup: vi.fn(), review: vi.fn(), calls: [] as string[], dbFailure: false }));
vi.mock('@/lib/observability', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({ from: mock.from }) }));
vi.mock('@/lib/digest/collect', () => ({ collectWeeklyDigest: mock.weekly }));
vi.mock('@/lib/digest/weekly', () => ({ buildWeeklyDigest: () => ({ subject: 'test', text: 'test', html: 'test' }) }));
vi.mock('@/lib/digest/errorsCollect', () => ({ collectErrorDigest: mock.errors }));
vi.mock('@/lib/digest/errors', () => ({ buildErrorDigest: () => ({ subject: 'test', text: 'test', html: 'test' }) }));
vi.mock('@/lib/engagement', () => ({ reviewsEnabled: () => true, followupsEnabled: () => true, sendFollowupEmail: mock.followup, sendReviewRequestEmail: mock.review }));
import { POST as weekly } from './weekly-digest/route';
import { POST as errors } from './error-digest/route';
import { POST as engagement } from './engagement/route';
const request = (job: string, authorized = true) => new NextRequest(`http://localhost/api/cron/${job}?dry_run=1`, { method: 'POST', headers: { authorization: authorized ? `Bearer ${'test-only-'.repeat(6)}` : 'invalid' } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'test-only-'.repeat(6));
  vi.stubEnv('RESEND_API_KEY', 'test-only'); vi.stubEnv('RESEND_FROM_EMAIL', 'test@example.invalid');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Preview must not send email'); }));
  mock.calls = []; mock.dbFailure = false;
  mock.weekly.mockResolvedValue({ memoriesNewThisWeek: 1, memoriesTotal: 1, agentStats: [] });
  mock.errors.mockImplementation(async (_admin, options) => {
    expect(await options.diagnose([])).toEqual([]);
    return { groups: [{ fingerprint: 'test' }], totalEvents: 1, diagnoses: [] };
  });
  mock.from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'or', 'in', 'gte', 'not', 'lte']) query[method] = () => query;
    query.insert = () => { throw new Error('Preview must not write'); };
    const data: Record<string, unknown> = {
      feature_settings: [{ user_id: 'owner', auto_followup_enabled: true, auto_review_enabled: true, google_review_url: 'https://example.invalid/review' }],
      profiles: [{ id: 'owner', business_name: 'Fixture', currency: 'NZD' }],
      quotes: [{ id: 'quote', client_id: 'client', sent_at: '2026-09-01T00:00:00Z', public_token: 'fixture', created_at: '2026-09-01T00:00:00Z' }],
      clients: { name: 'Fixture', email: 'client@example.invalid' },
    };
    const result = () => { mock.calls.push(table); return { data: data[table] ?? null, error: mock.dbFailure ? { message: 'unavailable' } : null }; };
    query.maybeSingle = async () => result(); query.then = (resolve: (v: unknown) => void) => resolve(result());
    return query;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('cron preview cannot contact recipients', () => {
  it('previews both owner digests and skips error-diagnosis model calls', async () => {
    for (const [name, handler] of [['weekly-digest', weekly], ['error-digest', errors]] as const) {
      expect(await (await handler(request(name))).json()).toMatchObject({ ok: true, dryRun: true, sent: false });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('previews eligible follow-up and review messages without claiming or sending them', async () => {
    const response = await engagement(request('engagement'));
    expect(await response.json()).toMatchObject({ ok: true, dryRun: true, eligible: 2 });
    expect(mock.followup).not.toHaveBeenCalled(); expect(mock.review).not.toHaveBeenCalled();
  });
  it('does not hide engagement database failures as an empty successful run', async () => {
    mock.dbFailure = true;
    expect((await engagement(request('engagement'))).status).toBe(500);
  });
  it('requires authentication even in preview mode', async () => {
    for (const [name, handler] of [['weekly-digest', weekly], ['error-digest', errors], ['engagement', engagement]] as const) {
      expect((await handler(request(name, false))).status).toBe(401);
    }
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.weekly).not.toHaveBeenCalled(); expect(mock.errors).not.toHaveBeenCalled();
  });
});
