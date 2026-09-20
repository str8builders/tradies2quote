import {workingDB,type PlanRecord} from "./local-db";

export async function listLocalPlans(db=workingDB):Promise<Array<Pick<PlanRecord,"id"|"name">>> {
  const plans:Array<Pick<PlanRecord,"id"|"name">>=[];
  // Release each record's PDF bytes as the cursor advances rather than
  // materialising every saved drawing together just to show its name.
  await db.plans.each(({id,name})=>{plans.push({id,name});});
  return plans;
}

export function storedPlanFile(record:Pick<PlanRecord,"file">):Blob {
  return record.file instanceof Blob?record.file:new Blob([record.file],{type:"application/pdf"});
}

export async function saveLocalPlan(record:Omit<PlanRecord,"file">&{file:Blob},expectedAnnotations:string|null,db=workingDB) {
  // Read before opening the transaction: file IO must not let IndexedDB
  // auto-commit before the conflict check and replacement finish together.
  const file=await record.file.arrayBuffer();
  await db.transaction("rw",db.plans,async()=>{
    const prior=await db.plans.get(record.id);
    if((prior?.annotations??null)!==expectedAnnotations)throw new Error("This plan changed in another tab. Export your measurements, then reopen the stored plan before merging them.");
    if(!prior&&await db.plans.count()>=20)throw new Error("This device holds 20 plans. Export and remove an older plan before saving another.");
    await db.plans.put({...record,file});
  });
}
