import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({owner: "owner-a", records: new Map<string, Record<string, unknown>>(), inserts: 0}));
vi.mock("@sentry/nextjs", () => ({captureException: vi.fn()}));
vi.mock("next/navigation", () => ({redirect: () => {throw new Error("signed out");}}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({
  auth: {getUser: async () => ({data:{user:{id:state.owner}}})},
  from: (table: string) => {
    let payload: Record<string,unknown> = {}; const filters: Record<string,unknown> = {};
    const q = {
      select: () => q, eq: (key:string,value:unknown) => {filters[key]=value;return q;},
      insert: (value: Record<string,unknown>) => {payload=value;return q;},
      maybeSingle: async () => {
        if(table==="profiles") return {data:{tax_rate:15,tax_label:"GST",currency:"NZD"}};
        const row=state.records.get(String(filters.id));
        return {data:row?.user_id===filters.user_id?row:null};
      },
      single: async () => {
        const id=String(payload.id);
        if(state.records.has(id)) return {data:null,error:{code:"23505"}};
        state.inserts++; state.records.set(id,JSON.parse(JSON.stringify(payload))); return {data:{id},error:null};
      },
      then: (resolve:(x:unknown)=>unknown) => Promise.resolve({error:null}).then(resolve),
    }; return q;
  },
})}));
import { createQuoteFromScan } from "./actions";
const key="b6a13bf5-3a4b-43bf-865f-472c939e1234";
const lines=[{name:"Timber",unit:"each",quantity:2,price:10,line_total:20}];
const meta={supplier:"Fixture",gstInclusive:false,acknowledge:true,idempotencyKey:key};
beforeEach(()=>{state.owner="owner-a";state.records.clear();state.inserts=0;});
it("replays a lost response without creating a second quote",async()=>{
  expect(await createQuoteFromScan(lines,meta)).toEqual({id:key});
  expect(await createQuoteFromScan(lines,meta)).toEqual({id:key});
  expect(state.inserts).toBe(1);
});
it("does not silently overwrite a different payload on retry",async()=>{
  await createQuoteFromScan(lines,meta);
  expect((await createQuoteFromScan([{...lines[0],price:20}],meta)).error).toContain("different working");
  expect(state.inserts).toBe(1);
});
it("does not return another owner's quote after an ID collision",async()=>{
  await createQuoteFromScan(lines,meta);state.owner="owner-b";
  expect((await createQuoteFromScan(lines,meta)).id).toBeUndefined();
  expect(state.inserts).toBe(1);
});
