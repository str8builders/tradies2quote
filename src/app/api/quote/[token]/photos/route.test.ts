import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock=vi.hoisted(()=>({quote:{id:'q1',status:'sent',expires_at:null as string|null,deleted_at:null as string|null},miss:false, photo:'a1', calls:[] as string[],download:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({adminClient:()=>({from:(table:string)=>{mock.calls.push(table);let id='';const q={select:()=>q,eq:(key:string,value:string)=>{if(key==='id')id=value;return q;},is:()=>q,order:async()=>({data:[{id:'a1',name:'Job photo'}]}),maybeSingle:async()=>({data:table==='quotes'?(mock.miss?null:mock.quote):id===mock.photo?{path:'private/a1.jpg'}:null,error:null})};return q;},storage:{from:()=>({download:mock.download})}})}));
import { GET } from './route';
const req=(photo=false)=>new NextRequest(`https://tradies2quote.com/api/quote/fixture/photos${photo?'?photo=a1':''}`);
const ctx={params:Promise.resolve({token:'fixture'})};
beforeEach(()=>{mock.quote={id:'q1',status:'sent',expires_at:null,deleted_at:null};mock.miss=false;mock.photo='a1';mock.calls=[];mock.download.mockReset().mockResolvedValue({data:new Blob(['image']),error:null});});
describe('private quote photos',()=>{
 it.each(['draft','declined','expired','unknown'])('does not expose %s photos',async status=>{mock.quote.status=status;expect((await GET(req(true),ctx)).status).toBe(404);expect(mock.calls).not.toContain('quote_attachments');expect(mock.download).not.toHaveBeenCalled();});
 it('blocks deleted, expired and missing quotes',async()=>{mock.quote.deleted_at=new Date().toISOString();expect((await GET(req(true),ctx)).status).toBe(404);mock.quote.deleted_at=null;mock.quote.expires_at='2000-01-01';expect((await GET(req(),ctx)).status).toBe(404);mock.miss=true;expect((await GET(req(),ctx)).status).toBe(404);});
 it.each(['sent','viewed','accepted','scheduled','in_progress','completed'])('serves %s photos without public caching',async status=>{mock.quote.status=status;const res=await GET(req(true),ctx);expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');expect(res.headers.get('content-type')).toBe('image/jpeg');});
 it('does not expose a photo from another quote',async()=>{mock.photo='other';expect((await GET(req(true),ctx)).status).toBe(404);expect(mock.download).not.toHaveBeenCalled();});
});
