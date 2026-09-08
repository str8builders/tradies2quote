import {isUUID,validateSnapshot,type CalculationSnapshot} from "./calculation-record";
export const DEVICE_WORKING_KEY="t2qcal.device-working.v1";
export type DeviceWorking={id:string;name:string;snapshot:CalculationSnapshot;updated_at:string;revision:0};
type Store=Pick<Storage,"getItem"|"setItem">;
export function readDeviceWorking(store:Store):DeviceWorking[]{
  const raw=store.getItem(DEVICE_WORKING_KEY);if(!raw)return [];
  const data:unknown=JSON.parse(raw);
  if(!Array.isArray(data)||data.length>100)throw new Error("The device library could not be read. Export or recover your browser data before replacing it.");
  return data.map((entry:unknown)=>{
    if(!entry||typeof entry!=="object")throw new Error("An entry in the device library is damaged.");
    const row=entry as Record<string,unknown>;
    if(!isUUID(row.id)||typeof row.name!=="string"||!row.name.trim()||row.name.length>120||typeof row.updated_at!=="string"||!Number.isFinite(Date.parse(row.updated_at)))throw new Error("An entry in the device library is damaged.");
    return {id:row.id,name:row.name,snapshot:validateSnapshot(row.snapshot),updated_at:row.updated_at,revision:0};
  });
}
export function saveDeviceWorking(store:Store,entry:DeviceWorking){
  if(!isUUID(entry.id)||!entry.name.trim()||entry.name.trim().length>120)throw new Error("Enter a calculation name of up to 120 characters.");
  const snapshot=validateSnapshot(entry.snapshot), records=readDeviceWorking(store);
  const next=[{...entry,name:entry.name.trim(),snapshot,revision:0},...records.filter(r=>r.id!==entry.id)];
  if(next.length>100)throw new Error("This device has 100 saved calculations. Export and remove older working before adding more.");
  store.setItem(DEVICE_WORKING_KEY,JSON.stringify(next));
}
export function removeDeviceWorking(store:Store,id:string){
  store.setItem(DEVICE_WORKING_KEY,JSON.stringify(readDeviceWorking(store).filter(r=>r.id!==id)));
}
export function importDeviceWorking(store:Store,backup:unknown):number{
  if(!backup||typeof backup!=="object"||!("version" in backup)||backup.version!==1||!("calculations" in backup))throw new Error("Choose a T2QCAL working backup.");
  const imported=readDeviceWorking({getItem:()=>JSON.stringify(backup.calculations),setItem:()=>{}}),existing=readDeviceWorking(store),byID=new Map(existing.map(row=>[row.id,row]));
  let count=0;
  for(const row of imported){const old=byID.get(row.id);if(!old||Date.parse(row.updated_at)>Date.parse(old.updated_at)){byID.set(row.id,row);count++;}}
  if(byID.size>100)throw new Error("This backup would exceed the limit of 100 device-saved calculations.");
  store.setItem(DEVICE_WORKING_KEY,JSON.stringify([...byID.values()]));return count;
}
