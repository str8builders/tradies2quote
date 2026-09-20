import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const fake=vi.hoisted(()=>({getUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:fake.getUser}})}));
vi.mock('@/lib/rate-limit',()=>({consumeFixedWindow:()=>({ok:true})}));
import {calculatorAccount,smallJSON} from './t2qcal-api';
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_APP_URL','https://tradies2quote.com');fake.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null});});
afterEach(()=>vi.unstubAllEnvs());
it('accepts the public website origin behind a loopback reverse proxy',async()=>{
 const result=await calculatorAccount(new Request('http://127.0.0.1:3001/api/t2qcal/calculations',{headers:{Origin:'https://tradies2quote.com'}}),true);
 expect(result.error).toBeUndefined();expect(result.user?.id).toBe('owner');
});
it('rejects foreign and absent origins without exposing account data',async()=>{
 for(const headers of ([{Origin:'https://example.org'},{}] as HeadersInit[])){const result=await calculatorAccount(new Request('http://127.0.0.1:3001/api/t2qcal/calculations',{headers}),true);expect(result.error?.status).toBe(403);expect(result.error?.headers.get('Cache-Control')).toBe('private, no-store');}
});
it('private API responses remain uncached for signed-out requests',async()=>{
 fake.getUser.mockResolvedValue({data:{user:null},error:null});const result=await calculatorAccount(new Request('https://tradies2quote.com/api/t2qcal/calculations'));expect(result.error?.status).toBe(401);expect(result.error?.headers.get('Cache-Control')).toContain('no-store');
});
it('rejects an oversized JSON stream without trusting Content-Length',async()=>{
 await expect(smallJSON(new Request('https://tradies2quote.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:'x'.repeat(33000)})}))).rejects.toThrow('too large');
});
it('rejects a queued backup when the browser has switched accounts',async()=>{
 const result=await calculatorAccount(new Request('https://tradies2quote.com/api/t2qcal/calculations',{headers:{Origin:'https://tradies2quote.com','X-T2Q-Owner':'previous-owner'}}),true);
 expect(result.error?.status).toBe(403);expect(result.user).toBeUndefined();
});
