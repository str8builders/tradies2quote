import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({owner: "owner-a", records: new Map<string, Record<string, unknown>>(), inserts: 0}));
vi.mock("@sentry/nextjs", () => ({captureException: vi.fn()}));
vi.mock("next/navigation", () => ({redirect: () => {throw new Error("signed out");}}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({
  auth: {getUser: async () => ({data:{user:{id:state.owner}}})},
  from: (table: string) => {
    if (table !== "profiles") throw new Error("Supplier quote must be created atomically");
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: {tax_rate:15,tax_label:"GST",currency:"NZD"}, error: null }) }; return q;
  },
  rpc: async (name: string, args: { p_quote_id: string; p_data: unknown; p_transcript: string }) => {
    expect(name).toBe("create_supplier_quote_atomic");
    const receipt = JSON.stringify({ owner: state.owner, quote: args.p_data, transcript: args.p_transcript });
    const existing = state.records.get(args.p_quote_id);
    if (existing) return existing.receipt === receipt ? { data: { id: args.p_quote_id }, error: null } : { error: { code: "23505" } };
    state.inserts++; state.records.set(args.p_quote_id, { receipt });
    return { data: { id: args.p_quote_id }, error: null };
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

it("rejects malformed runtime input and string acknowledgements before any writes", async () => {
  for (const invalid of [null, {}, { ...meta, acknowledge: "yes" }, { ...meta, total: "999" }, { ...meta, rowFailures: [null] }]) {
    expect((await createQuoteFromScan(lines, invalid as never)).error).toBeTruthy();
  }
  for (const invalid of [null, [null], [{...lines[0], quantity: -1}], [{...lines[0], price: "10"}]]) {
    expect((await createQuoteFromScan(invalid as never, meta)).error).toBeTruthy();
  }
  expect(state.inserts).toBe(0);
});
