import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({
  configured: true, construct: vi.fn(), retrieve: vi.fn(), from: vi.fn(),
  rpc: vi.fn(), capture: vi.fn(), calls: [] as string[], errors: {} as Record<string, { code: string; message?: string }>, completed: false,
  // Before the 20260929 ledger migration the `endpoint` column doesn't exist.
  legacy: false, inserts: [] as Record<string, unknown>[], filters: [] as string[],
}));
vi.mock('@/lib/observability', () => ({ captureError: mock.capture }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({ from: mock.from, rpc: mock.rpc }) }));
vi.mock('@/lib/stripe-client', () => ({ planForPrice: (id: string) => id === "price_crew" ? "crew" : null, isStripeConfigured: () => mock.configured, stripeClient: () => ({ webhooks: { constructEvent: mock.construct }, subscriptions: { retrieve: mock.retrieve } }) }));
import { POST } from './route';
const subscription = { id: 'sub_1', created: 1780000000, customer: 'cus_1', status: 'active', metadata: { t2q_user_id: 'user_1' }, items: { data: [{ price: { id: "price_crew" }, quantity: 1, current_period_end: 1800000000 }] } };
const request = (signature = 'signed') => new NextRequest('https://tradies2quote.com/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': signature }, body: '{"test":true}' });
beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = 'test-only';
  mock.configured = true; mock.errors = {}; mock.completed = false; mock.calls = []; mock.legacy = false; mock.inserts = []; mock.filters = [];
  mock.construct.mockReturnValue({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { ...subscription, status: 'past_due' } } });
  mock.retrieve.mockResolvedValue(subscription);
  mock.rpc.mockImplementation(async () => { mock.calls.push('subscriptions.sync'); return { error: mock.errors['subscriptions.sync'] ?? null }; });
  mock.from.mockImplementation((table: string) => {
    let op = 'select';
    let usesEndpoint = false;
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'upsert', 'update', 'eq']) query[method] = (...args: unknown[]) => {
      if (['insert', 'upsert', 'update'].includes(method)) {
        op = method;
        if (op === 'upsert') expect(args[0]).toMatchObject({ status: 'active' });
        if (op === 'insert') { mock.inserts.push(args[0] as Record<string, unknown>); usesEndpoint = 'endpoint' in (args[0] as object); }
      }
      if (method === 'eq') { mock.filters.push(`${args[0]}=${args[1]}`); if (args[0] === 'endpoint') usesEndpoint = true; }
      return query;
    };
    const result = () => {
      const key = `${table}.${op}`; mock.calls.push(key);
      if (mock.legacy && usesEndpoint) {
        return { data: null, error: op === 'insert' ? { code: 'PGRST204', message: "Could not find the 'endpoint' column of 'stripe_webhook_events' in the schema cache" } : { code: '42703', message: 'column stripe_webhook_events.endpoint does not exist' } };
      }
      return { error: mock.errors[key] ?? null, data: table === 'stripe_webhook_events' ? (mock.completed ? { event_id: 'evt_1' } : null) : [{ user_id: 'user_1' }] };
    };
    query.maybeSingle = async () => result();
    query.then = (resolve: (value: unknown) => void) => resolve(result());
    return query;
  });
});
describe('Stripe durable acknowledgement', () => {
  it('returns a retryable failure on DB error without recording completion, and succeeds on retry', async () => {
    mock.errors['subscriptions.sync'] = { code: '08006' };
    expect((await POST(request())).status).toBe(500);
    expect(mock.calls).not.toContain('stripe_webhook_events.insert');
    mock.errors = {};
    expect((await POST(request())).status).toBe(200);
    expect(mock.calls.slice(-2)).toEqual(['subscriptions.sync', 'stripe_webhook_events.insert']);
  });
  it('fails closed on ledger read failure', async () => {
    mock.errors['stripe_webhook_events.select'] = { code: '08006' };
    expect((await POST(request())).status).toBe(500);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it('retries if recording completion fails', async () => {
    mock.errors['stripe_webhook_events.insert'] = { code: '08006' };
    expect((await POST(request())).status).toBe(500);
  });
  it('acknowledges a completed duplicate without touching the subscription', async () => {
    mock.completed = true;
    expect(await (await POST(request())).json()).toMatchObject({ duplicate: true });
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it('refreshes an older event from Stripe before saving current subscription status', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mock.retrieve).toHaveBeenCalledWith('sub_1');
  });
  it('cannot grant subscription access from a one-time payment checkout', async () => {
    mock.construct.mockReturnValue({ id: 'evt_2', type: 'checkout.session.completed', data: { object: { mode: 'payment', customer: 'cus_1', metadata: { t2q_user_id: 'user_1' } } } });
    expect((await POST(request())).status).toBe(200);
    expect(mock.calls).not.toContain('subscriptions.sync');
  });
  it('keys the ledger on this endpoint and the event (the deposits webhook gets the same event)', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mock.filters).toEqual(expect.arrayContaining(['endpoint=subscriptions', 'event_id=evt_1']));
    expect(mock.inserts.at(-1)).toEqual({ endpoint: 'subscriptions', event_id: 'evt_1', type: 'customer.subscription.updated' });
  });
  it('keeps working before the ledger migration, with the plain event id', async () => {
    mock.legacy = true;
    expect((await POST(request())).status).toBe(200);
    expect(mock.filters).toContain('event_id=evt_1');
    expect(mock.inserts.at(-1)).toEqual({ event_id: 'evt_1', type: 'customer.subscription.updated' });
    mock.completed = true;
    expect(await (await POST(request())).json()).toMatchObject({ duplicate: true });
  });
  it("acknowledges a deleted account's cancelled subscription instead of making Stripe retry for days", async () => {
    mock.construct.mockReturnValue({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { ...subscription, status: 'canceled' } } });
    mock.retrieve.mockResolvedValue({ ...subscription, status: 'canceled' });
    mock.errors['subscriptions.sync'] = { code: 'P0001', message: 'Subscription customer is not mapped yet.' };
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, ignored: 'unmapped_customer' });
    expect(mock.calls).toContain('stripe_webhook_events.insert');
    expect(mock.capture).not.toHaveBeenCalled();
  });
  it('still fails (and reports) a LIVE subscription on an unmapped customer: someone may be billed', async () => {
    mock.errors['subscriptions.sync'] = { code: 'P0001', message: 'Subscription customer is not mapped yet.' };
    expect((await POST(request())).status).toBe(500);
    expect(mock.calls).not.toContain('stripe_webhook_events.insert');
    expect(mock.capture).toHaveBeenCalled();
  });
  it('rejects an invalid signature before reading the database', async () => {
    mock.construct.mockImplementation(() => { throw new Error('invalid signature'); });
    expect((await POST(request())).status).toBe(400);
    expect(mock.from).not.toHaveBeenCalled();
    // The report names both possible causes so the digest reader knows where to look.
    const reported = mock.capture.mock.calls.at(-1)?.[0] as Error;
    expect(reported.message).toMatch(/forged\/test request/);
    expect(reported.message).toMatch(/STRIPE_WEBHOOK_SECRET/);
  });
});
