import Dexie, {liveQuery,type Table} from "dexie";
import {DEVICE_WORKING_KEY, importDeviceWorking, readDeviceWorking, removeDeviceWorking, saveDeviceWorking, type DeviceWorking} from "./device-working";
import {activateDeviceJob, attachToActiveJob, createDeviceJob, readDeviceJobs, type DeviceJobs} from "./device-jobs";
import type {CalculationSnapshot} from "./calculation-record";

const JOBS_KEY="t2qcal.device-jobs.v1";
type State={key:string;value:string};
export type BackupItem={ownerId:string;id:string;sourceId?:string;operation:string;name:string;snapshot:CalculationSnapshot;revision:number;status:"pending"|"sending"|"conflict"|"error";attempts:number;nextAttempt:number;leaseUntil:number;error:string};
export type Receipt={ownerId:string;id:string;serverId?:string;name:string;snapshot:CalculationSnapshot;revision:number;updated_at:string};
// Older plans contain Blob values; new saves use bytes to avoid WebKit's
// IndexedDB Blob/File preparation failure. Both formats remain readable.
export type PlanRecord={id:string;name:string;file:Blob|ArrayBuffer;annotations:string;updatedAt:string};
export class WorkingDB extends Dexie {
  state!:Table<State,string>;
  outbox!:Table<BackupItem,[string,string]>;
  receipts!:Table<Receipt,[string,string]>;
  plans!:Table<PlanRecord,string>;
  constructor(name="t2qcal-working"){
    super(name);
    this.version(1).stores({state:"key",outbox:"[ownerId+id],ownerId,status",receipts:"[ownerId+id],ownerId",plans:"id,updatedAt"});
  }
}
export const workingDB=new WorkingDB();
type Store=Pick<Storage,"getItem"|"setItem">;
const emptyStore:Store={getItem:()=>null,setItem:()=>{}};
function legacyStore():Store {return typeof window==="undefined"?emptyStore:window.localStorage;}
/** Validate both libraries before committing either. Keep the original storage and a raw recovery copy. */
export async function initializeWorking(db=workingDB,legacy:Store=legacyStore()) {
  if(await db.state.get("migration-v1"))return;
  await db.transaction("rw",db.state,async()=>{
    if(await db.state.get("migration-v1"))return;
    const calculations=readDeviceWorking(legacy),jobs=readDeviceJobs(legacy);
    await db.state.bulkPut([
      {key:DEVICE_WORKING_KEY,value:JSON.stringify(calculations)},
      {key:JOBS_KEY,value:JSON.stringify(jobs)},
      {key:"legacy-recovery",value:JSON.stringify({calculations:legacy.getItem(DEVICE_WORKING_KEY),jobs:legacy.getItem(JOBS_KEY)})},
      {key:"migration-v1",value:new Date().toISOString()}
    ]);
  });
}
async function mutate<T>(fn:(store:Store)=>T,db=workingDB):Promise<T>{
  await initializeWorking(db);
  return db.transaction("rw",db.state,async()=>{
    const map=new Map((await db.state.toArray()).map(row=>[row.key,row.value]));
    const changed=new Map<string,string>();
    const store:Store={getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value);changed.set(key,value);}};
    const result=fn(store);
    await db.state.bulkPut([...changed].map(([key,value])=>({key,value})));
    return result;
  });
}
export async function readLocalLibrary(db=workingDB){
  await initializeWorking(db);
  return db.transaction("r",db.state,async()=>{
    const rows=await db.state.toArray(),store:Store={getItem:key=>rows.find(row=>row.key===key)?.value??null,setItem:()=>{}};
    return {calculations:readDeviceWorking(store),jobs:readDeviceJobs(store)};
  });
}
export const saveLocalWorking=(row:DeviceWorking,db=workingDB)=>mutate(store=>{saveDeviceWorking(store,row);return attachToActiveJob(store,row.id);},db);
export const createLocalJob=(name:string,client:string,db=workingDB)=>mutate(store=>createDeviceJob(store,name,client),db);
export const activateLocalJob=(id:string|null,db=workingDB)=>mutate(store=>activateDeviceJob(store,id),db);
export const removeLocalWorking=(id:string,db=workingDB)=>mutate(store=>{
  const row=readDeviceWorking(store).find(row=>row.id===id),jobs=readDeviceJobs(store).jobs.filter(job=>job.calculationIds.includes(id)).map(job=>job.id);
  removeDeviceWorking(store,id);return row?{row,jobs}:null;
},db);
export const restoreLocalWorking=(removed:{row:DeviceWorking;jobs:string[]},db=workingDB)=>mutate(store=>{
  if(readDeviceWorking(store).some(row=>row.id===removed.row.id))throw new Error("This working has been saved again. Reopen it instead of overwriting it with Undo.");
  saveDeviceWorking(store,removed.row);
  const data=readDeviceJobs(store);
  for(const job of data.jobs)if(removed.jobs.includes(job.id)&&!job.calculationIds.includes(removed.row.id)){
    if(job.calculationIds.length>=100)throw new Error("The original job is full. Export working before restoring it.");
    job.calculationIds.push(removed.row.id);
  }
  store.setItem(JOBS_KEY,JSON.stringify(data));
},db);
export const importLocalBackup=(backup:unknown,db=workingDB)=>mutate(store=>{
  if(!backup||typeof backup!=="object"||!("version" in backup)||![1,2].includes(backup.version as number)||!("calculations" in backup))throw new Error("Choose a T2QCAL working backup.");
  const count=importDeviceWorking(store,{version:1,calculations:backup.calculations});
  if(backup.version===2){
    if(!("jobs" in backup))throw new Error("This backup is missing its jobs.");
    const incoming=readDeviceJobs({getItem:()=>JSON.stringify(backup.jobs),setItem:()=>{}}),existing=readDeviceJobs(store);
    const ids=new Set(readDeviceWorking(store).map(row=>row.id));
    for(const job of incoming.jobs){
      const previous=existing.jobs.find(row=>row.id===job.id);
      const links=[...new Set([...(previous?.calculationIds??[]),...job.calculationIds])].filter(id=>ids.has(id));
      if(links.length>100)throw new Error("A restored job would exceed 100 calculations.");
      if(previous)previous.calculationIds=links;else existing.jobs.push({...job,calculationIds:links});
    }
    if(!existing.activeId&&incoming.activeId)existing.activeId=incoming.activeId;
    if(existing.jobs.length>100)throw new Error("This backup would exceed 100 jobs.");
    store.setItem(JOBS_KEY,JSON.stringify(existing));
  }
  return count;
},db);
export async function exportLocalBackup(db=workingDB){const data=await readLocalLibrary(db);return {version:2,exportedAt:new Date().toISOString(),...data};}
export type LocalLibrary={calculations:DeviceWorking[];jobs:DeviceJobs};

/** Migration writes must happen outside Dexie's read-only live query context. */
export function observeLocalLibrary(next:(value:LocalLibrary)=>void,error:(reason:unknown)=>void,db=workingDB){
  let cancelled=false,subscription:{unsubscribe:()=>void}|undefined;
  void initializeWorking(db).then(()=>{if(!cancelled)subscription=liveQuery(()=>readLocalLibrary(db)).subscribe({next,error});}).catch(error);
  return {unsubscribe:()=>{cancelled=true;subscription?.unsubscribe();}};
}
