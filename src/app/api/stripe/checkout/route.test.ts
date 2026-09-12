import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ lookupError: false, saveError: false, createCustomer: vi.fn(), createSession: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'fixture-user', email: 'fixture@example.invalid' } } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({ from: mock.from }) }));
vi.mock('@/lib/stripe-client', () => ({ isStripeConfigured: () => true, getPlanPriceId: () => 'price_fixture', stripeClient: () => ({ customers: { create: mock.createCustomer }, checkout: { sessions: { create: mock.createSession } } }) }));
import { POST } from './route';
beforeEach(() => {
  vi.clearAllMocks(); mock.lookupError = false; mock.saveError = false;
  mock.createCustomer.mockResolvedValue({ id: 'cus_fixture' }); mock.createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/fixture' });
  mock.from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: mock.lookupError ? { message: 'offline' } : null }), upsert: async () => ({ error: mock.saveError ? { message: 'offline' } : null }) };
    return query;
  });
});
describe('checkout identity persistence', () => {
  it('does not create a second customer when its database lookup fails', async () => {
    mock.lookupError = true;
    expect((await POST(new NextRequest('http://localhost'))).status).toBe(502);
    expect(mock.createCustomer).not.toHaveBeenCalled(); expect(mock.createSession).not.toHaveBeenCalled();
  });
  it('does not offer checkout until the customer mapping is saved', async () => {
    mock.saveError = true;
    expect((await POST(new NextRequest('http://localhost'))).status).toBe(502);
    expect(mock.createSession).not.toHaveBeenCalled();
    expect(mock.createCustomer).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: 't2q-customer-fixture-user' });
  });
});
