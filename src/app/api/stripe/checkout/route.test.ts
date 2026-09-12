import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ native: false, user: true, lookupError: false, saveError: false, owner: null as string | null, leaseError: false, price: 4900, customer: null as string | null, subscriptions: [] as unknown[], sessions: [] as unknown[], createCustomer: vi.fn(), createSession: vi.fn(), from: vi.fn(), rpc: vi.fn(), expire: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/native-shell', () => ({ isNativeShellRequest: async () => mock.native }));
vi.mock('@/lib/rate-limit', () => ({ consumeFixedWindow: () => ({ok:true}) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mock.rpc, auth: { getUser: async () => ({ data: { user: mock.user ? { id: 'fixture-user', email: 'fixture@example.invalid' } : null } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({ from: mock.from }) }));
vi.mock('@/lib/stripe-client', () => ({ isStripeConfigured: () => true, getPlanPriceId: (plan: string) => `price_${plan}`, stripeClient: () => ({ prices: { retrieve: async () => ({ active: true, livemode: true, tax_behavior: 'inclusive', currency: 'nzd', unit_amount: mock.price, recurring: { interval:'month', interval_count:1 } }) }, subscriptions: { list: async () => ({ data: mock.subscriptions }) }, customers: { create: mock.createCustomer }, checkout: { sessions: { list: async () => ({ data: mock.sessions }), expire: mock.expire, create: mock.createSession } } }) }));
import { POST } from './route';
const request = (plan='solo') => new NextRequest('http://localhost/api/stripe/checkout', { method:'POST', body:JSON.stringify({plan}) });
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(mock,{native:false,user:true,lookupError:false,saveError:false,owner:null,leaseError:false,price:4900,customer:null,subscriptions:[],sessions:[]});
  process.env.TEAM_PLANS_ENABLED='true';
  mock.createCustomer.mockResolvedValue({ id: 'cus_fixture' }); mock.createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/fixture' });
  mock.rpc.mockImplementation(async (name: string) => name==='my_team_owner' ? {data:mock.owner,error:null} : name==='claim_checkout' ? {data:{key:'lease-1',plan:'solo',created_at:new Date().toISOString()},error:mock.leaseError?{message:'Checkout is opening.'}:null} : {error:null});
  mock.from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mock.customer ? {stripe_customer_id: mock.customer} : null, error: mock.lookupError ? { message: 'offline' } : null }), upsert: async () => ({ error: mock.saveError ? { message: 'offline' } : null }) }; return query;
  });
});
describe('checkout access and durable identity', () => {
  it('blocks native purchases before billing access',async()=>{mock.native=true;expect((await POST(request())).status).toBe(403);expect(mock.from).not.toHaveBeenCalled();});
  it('requires sign-in',async()=>{mock.user=false;expect((await POST(request())).status).toBe(401);});
  it('rejects unrecognised or prototype plan names',async()=>{expect((await POST(request('__proto__'))).status).toBe(400);});
  it('keeps team purchases gated until release is enabled',async()=>{process.env.TEAM_PLANS_ENABLED='false';expect((await POST(request('crew'))).status).toBe(503);});
  it('cannot bill a team member independently',async()=>{mock.owner='another-user';expect((await POST(request())).status).toBe(409);expect(mock.createCustomer).not.toHaveBeenCalled();});
  it('does not create a second customer when its database lookup fails', async () => { mock.lookupError = true; expect((await POST(request())).status).toBe(502); expect(mock.createCustomer).not.toHaveBeenCalled(); expect(mock.createSession).not.toHaveBeenCalled(); });
  it('does not offer checkout until the customer mapping is saved', async () => { mock.saveError = true; expect((await POST(request())).status).toBe(502); expect(mock.createSession).not.toHaveBeenCalled(); expect(mock.createCustomer).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: 't2q-customer-fixture-user' }); });
  it.each([['solo',4900],['crew',7900],['builder',19900]])('uses only the configured %s price',async(plan,amount)=>{mock.price=amount as number;expect((await POST(request(plan as string))).status).toBe(200);expect(mock.createSession).toHaveBeenCalledWith(expect.objectContaining({line_items:[{price:`price_${plan}`,quantity:1}],metadata:expect.objectContaining({t2q_plan:plan})}),expect.anything());expect(mock.rpc).toHaveBeenCalledWith('finish_checkout',{p_key:'lease-1'});});
  it('rejects a misconfigured amount',async()=>{mock.price=1;expect((await POST(request())).status).toBe(502);expect(mock.createSession).not.toHaveBeenCalled();});
  it('does not create another checkout while its lease is held',async()=>{mock.leaseError=true;expect((await POST(request())).status).toBe(409);expect(mock.createSession).not.toHaveBeenCalled();});
  it('reuses a completed checkout setup on retry',async()=>{mock.sessions=[{id:'cs_1',url:'https://checkout.stripe.com/existing',metadata:{t2q_user_id:'fixture-user',t2q_checkout_key:'lease-1'}}];const res=await POST(request());expect((await res.json()).url).toContain('existing');expect(mock.createSession).not.toHaveBeenCalled();expect(mock.expire).not.toHaveBeenCalled();});
  it('blocks another subscription while one already exists',async()=>{mock.customer='cus_fixture';mock.subscriptions=[{status:'active',metadata:{t2q_user_id:'fixture-user'}}];expect((await POST(request())).status).toBe(409);expect(mock.createSession).not.toHaveBeenCalled();});
});
