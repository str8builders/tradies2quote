import {it,expect,vi,afterEach} from 'vitest';
import {NextRequest} from 'next/server';
const auth=vi.hoisted(()=>({user:{id:'owner'} as {id:string}|null}));
vi.mock('@supabase/ssr',()=>({createServerClient:(_url:unknown,_key:unknown,options:{cookies:{setAll:(cookies:unknown[])=>void}})=>({auth:{getUser:async()=>{options.cookies.setAll([{name:'session-refresh',value:'test-only',options:{path:'/',httpOnly:true}}]);return{data:{user:auth.user}};}}})}));
import {updateSession} from './middleware';
afterEach(()=>{vi.unstubAllEnvs();auth.user={id:'owner'};});
it('returns signed-in users to their calculator on the public origin',async()=>{
 vi.stubEnv('NEXT_PUBLIC_APP_URL','https://tradies2quote.com');
 const response=await updateSession(new NextRequest('http://127.0.0.1:3001/login?next=%2Ft2qcal%2Fsaved'));
 expect(response.headers.get('location')).toBe('https://tradies2quote.com/t2qcal/saved');expect(response.cookies.get('session-refresh')?.value).toBe('test-only');
});
it('keeps a protected destination query through sign-in',async()=>{
 vi.stubEnv('NEXT_PUBLIC_APP_URL','https://tradies2quote.com');auth.user=null;
 const response=await updateSession(new NextRequest('http://127.0.0.1:3001/app/quotes?filter=draft'));
 const url=new URL(response.headers.get('location')!);expect(url.origin).toBe('https://tradies2quote.com');expect(url.pathname).toBe('/login');expect(url.searchParams.get('next')).toBe('/app/quotes?filter=draft');
});
it('does not redirect sign-in to an external next URL',async()=>{
 vi.stubEnv('NEXT_PUBLIC_APP_URL','https://tradies2quote.com');
 const response=await updateSession(new NextRequest('http://127.0.0.1:3001/login?next=https%3A%2F%2Fevil.example'));
 expect(response.headers.get('location')).toBe('https://tradies2quote.com/app');
});
