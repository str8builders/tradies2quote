import "fake-indexeddb/auto";
import {afterEach,expect,it} from "vitest";
import {WorkingDB} from "./local-db";
import {saveLocalPlan,storedPlanFile} from "./plan-storage";

const databases:WorkingDB[]=[];
function database(){const db=new WorkingDB(`plan-${crypto.randomUUID()}`);databases.push(db);return db;}
const record=()=>({id:crypto.randomUUID(),name:"Drawing.pdf",file:new Blob([new Uint8Array([37,80,68,70,45,0,255])],{type:"application/pdf"}),annotations:'{"version":1}',updatedAt:new Date().toISOString()});
afterEach(async()=>{for(const db of databases.splice(0))await db.delete();});

it("saves exact PDF bytes when IndexedDB rejects Blob values",async()=>{
  const db=database(),plan=record();
  db.plans.hook("creating",(_key,row)=>{if(row.file instanceof Blob)throw new DOMException("Error preparing Blob/File data to be stored in object store","UnknownError");});
  await expect(db.plans.put(plan)).rejects.toThrow("preparing Blob/File");
  await saveLocalPlan(plan,null,db);
  const saved=(await db.plans.get(plan.id))!;
  expect(saved.file).toBeInstanceOf(ArrayBuffer);
  expect(await storedPlanFile(saved).arrayBuffer()).toEqual(await plan.file.arrayBuffer());
  expect(saved.annotations).toBe(plan.annotations);
});

it("reads old Blob records and preserves their measurements when saved again",async()=>{
  const db=database(),plan=record();await db.plans.put(plan);
  const old=(await db.plans.get(plan.id))!;
  expect(await storedPlanFile(old).arrayBuffer()).toEqual(await plan.file.arrayBuffer());
  await saveLocalPlan({...plan,file:storedPlanFile(old)},old.annotations,db);
  const updated=(await db.plans.get(plan.id))!;
  expect(updated.annotations).toBe(old.annotations);
  expect(await storedPlanFile(updated).arrayBuffer()).toEqual(await plan.file.arrayBuffer());
});

it("does not overwrite changes made by another tab during file reading",async()=>{
  const db=database(),plan=record();await saveLocalPlan(plan,null,db);
  const file=new Blob(["changed"]);
  file.arrayBuffer=async()=>{await db.plans.update(plan.id,{annotations:"newer working"});return new ArrayBuffer(7);};
  await expect(saveLocalPlan({...plan,file,annotations:"stale working"},plan.annotations,db)).rejects.toThrow("another tab");
  expect((await db.plans.get(plan.id))?.annotations).toBe("newer working");
});

it("keeps the previous plan intact if its file cannot be read",async()=>{
  const db=database(),plan=record();await saveLocalPlan(plan,null,db);
  const file=new Blob(["unreadable"]);file.arrayBuffer=async()=>{throw new Error("File unavailable");};
  await expect(saveLocalPlan({...plan,file,annotations:"replacement"},plan.annotations,db)).rejects.toThrow("File unavailable");
  const saved=(await db.plans.get(plan.id))!;
  expect(saved.annotations).toBe(plan.annotations);
  expect(await storedPlanFile(saved).arrayBuffer()).toEqual(await plan.file.arrayBuffer());
});

it("keeps the device plan limit while allowing updates to an existing plan",async()=>{
  const db=database(),plans=Array.from({length:20},record);
  for(const plan of plans)await saveLocalPlan(plan,null,db);
  await expect(saveLocalPlan(record(),null,db)).rejects.toThrow("20 plans");
  await saveLocalPlan({...plans[0],annotations:"updated"},plans[0].annotations,db);
  expect(await db.plans.count()).toBe(20);
  expect((await db.plans.get(plans[0].id))?.annotations).toBe("updated");
});
