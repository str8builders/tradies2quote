import {isUUID} from "./calculation-record";
const KEY="t2qcal.device-jobs.v1";
type Store=Pick<Storage,"getItem"|"setItem">;
export type DeviceJob={id:string;name:string;client:string;calculationIds:string[];createdAt:string};
export type DeviceJobs={version:1;activeId:string|null;jobs:DeviceJob[]};
export function readDeviceJobs(store:Store):DeviceJobs{
 const raw=store.getItem(KEY);if(!raw)return {version:1,activeId:null,jobs:[]};
 const data=JSON.parse(raw) as DeviceJobs;
 if(!data||data.version!==1||!Array.isArray(data.jobs)||data.jobs.length>100||!(data.activeId===null||isUUID(data.activeId)))throw new Error("The job library could not be read. Existing data has been preserved.");
 const seen=new Set<string>();
 for(const j of data.jobs){if(!j||!isUUID(j.id)||seen.has(j.id)||typeof j.name!=="string"||!j.name.trim()||j.name.length>120||typeof j.client!=="string"||j.client.length>120||!Array.isArray(j.calculationIds)||j.calculationIds.length>100||!j.calculationIds.every(isUUID)||typeof j.createdAt!=="string"||!Number.isFinite(Date.parse(j.createdAt)))throw new Error("A saved job could not be read. Existing data has been preserved.");seen.add(j.id);}
 if(data.activeId&&!seen.has(data.activeId))throw new Error("The active job could not be found. Existing data has been preserved.");return data;
}
export function createDeviceJob(store:Store,name:string,client:string):DeviceJobs{
 const data=readDeviceJobs(store);if(!name.trim()||name.trim().length>120||client.trim().length>120)throw new Error("Enter a job name and client of up to 120 characters each.");if(data.jobs.length>=100)throw new Error("This device has reached 100 jobs.");
 const job:DeviceJob={id:crypto.randomUUID(),name:name.trim(),client:client.trim(),calculationIds:[],createdAt:new Date().toISOString()};const next:DeviceJobs={version:1,activeId:job.id,jobs:[job,...data.jobs]};store.setItem(KEY,JSON.stringify(next));return next;
}
export function activateDeviceJob(store:Store,id:string|null):DeviceJobs{const data=readDeviceJobs(store);if(id&&!data.jobs.some(j=>j.id===id))throw new Error("This job could not be found.");const next={...data,activeId:id};store.setItem(KEY,JSON.stringify(next));return next;}
export function attachToActiveJob(store:Store,calculationId:string):string|null{if(!isUUID(calculationId))throw new Error("Invalid calculation reference.");const data=readDeviceJobs(store),job=data.jobs.find(j=>j.id===data.activeId);if(!job)return null;if(!job.calculationIds.includes(calculationId)){if(job.calculationIds.length>=100)throw new Error(`${job.name} already holds 100 calculations. Start a new job or remove older working first.`);job.calculationIds.push(calculationId);}store.setItem(KEY,JSON.stringify(data));return job.name;}
/** Removing saved working also removes it from every job, so job lists never point at nothing or grow without bound. */
export function detachCalculation(store:Store,calculationId:string):void{const raw=store.getItem(KEY);if(!raw)return;let data:DeviceJobs;try{data=readDeviceJobs(store);}catch{return;}let changed=false;for(const j of data.jobs){const next=j.calculationIds.filter(id=>id!==calculationId);if(next.length!==j.calculationIds.length){j.calculationIds=next;changed=true;}}if(changed)store.setItem(KEY,JSON.stringify(data));}
