import "fake-indexeddb/auto";
import {afterEach,describe,it,expect} from "vitest";
import {WorkingDB,initializeWorking,readLocalLibrary,saveLocalWorking,createLocalJob,removeLocalWorking,restoreLocalWorking,exportLocalBackup,importLocalBackup} from "./local-db";
import {queueBackup,flushBackups,resolveBackup,retryBackup} from "./backup-sync";
import {upgradeSnapshotValues} from "./calculation-record";
const databases:WorkingDB[]=[];
const db=()=>{const value=new WorkingDB(`test-${crypto.randomUUID()}`);databases.push(value);return value;};
const snapshot=()=>({version:1 as const,slug:"concrete-slab",unit:"metric" as const,values:upgradeSnapshotValues("concrete-slab","metric",{length:6000,width:4000,thickness:100,waste:10,rate:200})});
const row=()=>({id:crypto.randomUUID(),name:"Slab",snapshot:snapshot(),updated_at:new Date().toISOString(),revision:0 as const});
const accountA=crypto.randomUUID(),accountB=crypto.randomUUID();
afterEach(async()=>{await Promise.all(databases.splice(0).map(value=>value.delete()));});
describe("offline library",()=>{
  it("preserves originals and migrates both collections only once",async()=>{
    const database=db(),item=row(),legacy=new Map([["t2qcal.device-working.v1",JSON.stringify([item])]]);
    await initializeWorking(database,{getItem:key=>legacy.get(key)??null,setItem:()=>{throw Error("must not write legacy");}});
    legacy.set("t2qcal.device-working.v1","damaged");
    expect((await readLocalLibrary(database)).calculations[0].id).toBe(item.id);
    expect((await database.state.get("legacy-recovery"))?.value).toContain(item.id);
  });
  it("rolls back the entire migration if jobs are damaged",async()=>{
    const database=db();await expect(initializeWorking(database,{getItem:key=>key.includes("jobs")?"broken":JSON.stringify([row()]),setItem:()=>{}})).rejects.toThrow();
    expect(await database.state.count()).toBe(0);
  });
  it("serializes simultaneous saves and restores removed job links",async()=>{
    const database=db();await createLocalJob("Site one","Client",database);
    const a=row(),b=row();await Promise.all([saveLocalWorking(a,database),saveLocalWorking(b,database)]);
    expect((await readLocalLibrary(database)).calculations).toHaveLength(2);
    const removed=await removeLocalWorking(a.id,database);expect((await readLocalLibrary(database)).jobs.jobs[0].calculationIds).toEqual([b.id]);
    await restoreLocalWorking(removed!,database);expect((await readLocalLibrary(database)).jobs.jobs[0].calculationIds).toContain(a.id);
    const copy=db();await importLocalBackup(await exportLocalBackup(database),copy);expect((await readLocalLibrary(copy)).jobs.jobs[0].calculationIds).toHaveLength(2);
  });
  it("rejects an invalid job import without partially importing calculations",async()=>{
    const database=db();await expect(importLocalBackup({version:2,calculations:[row()],jobs:{version:42}},database)).rejects.toThrow();expect((await readLocalLibrary(database)).calculations).toHaveLength(0);
  });
});
describe("account outbox",()=>{
  it("recovers a lost response without changing operation target or base revision",async()=>{
    const database=db(),item=row(),calls:RequestInit[]=[];
    await queueBackup({...item,ownerId:accountA},database);
    const fetcher=(async(_url,init)=>{calls.push(init!);if(calls.length===1)throw Error("connection lost after commit");return Response.json({record:{...item,revision:1}});}) as typeof fetch;
    await flushBackups(accountA,fetcher,database);expect(await database.outbox.count()).toBe(1);
    await retryBackup(accountA,item.id,database);await flushBackups(accountA,fetcher,database);
    expect(calls[0].body).toBe(calls[1].body);expect(await database.outbox.count()).toBe(0);expect((await database.receipts.get([accountA,item.id]))?.revision).toBe(1);
  });
  it("leases across tabs and never flushes another account's queued working",async()=>{
    const database=db(),item=row();await queueBackup({...item,ownerId:accountA},database);await queueBackup({...row(),ownerId:accountB},database);
    let calls=0;const fetcher=(async(_url,init)=>{calls++;expect((init!.headers as Record<string,string>)["X-T2Q-Owner"]).toBe(accountA);await new Promise(resolve=>setTimeout(resolve,20));return Response.json({record:{...item,revision:1}});}) as typeof fetch;
    await Promise.all([flushBackups(accountA,fetcher,database),flushBackups(accountA,fetcher,database)]);expect(calls).toBe(1);expect((await database.outbox.toArray())[0].ownerId).toBe(accountB);
  });
  it("retains conflicts until an explicit copy or server-version choice",async()=>{
    const database=db(),item=row();await queueBackup({...item,ownerId:accountA},database);
    await flushBackups(accountA,(async()=>Response.json({error:"Changed elsewhere"},{status:409})) as typeof fetch,database);
    expect((await database.outbox.get([accountA,item.id]))?.status).toBe("conflict");
    await expect(queueBackup({...item,ownerId:accountA},database)).rejects.toThrow("conflict");
    await resolveBackup(accountA,item.id,true,database);const copy=(await database.outbox.toArray())[0];expect(copy.id).not.toBe(item.id);expect(copy.revision).toBe(0);expect(copy.status).toBe("pending");
    await queueBackup({...item,ownerId:accountA,name:"Edited copy while offline"},database);
    expect(await database.outbox.count()).toBe(1);expect((await database.outbox.toArray())[0].id).toBe(copy.id);
    await flushBackups(accountA,(async()=>Response.json({record:{...item,id:copy.id,name:"Edited copy while offline",revision:1}})) as typeof fetch,database);
    await queueBackup({...item,ownerId:accountA,name:"Next edit"},database);
    const next=(await database.outbox.toArray())[0];expect(next.id).toBe(copy.id);expect(next.revision).toBe(1);
  });
});
