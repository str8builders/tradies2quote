import {describe,it,expect} from "vitest";
import {validateSnapshot} from "./calculation-record";
import {DEVICE_WORKING_KEY,importDeviceWorking,readDeviceWorking,saveDeviceWorking,removeDeviceWorking,type DeviceWorking} from "./device-working";
const row:DeviceWorking={id:"10000000-0000-4000-8000-000000000001",name:"Slab on site",revision:0,updated_at:"2026-09-09T00:00:00.000Z",snapshot:{version:1,slug:"concrete-slab",unit:"metric",values:{length:6000,width:4000,thickness:100,waste:10,rate:200}}};
function memory(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}
describe("device working",()=>{
  it("saves and reopens exact inputs without an account",()=>{const store=memory();saveDeviceWorking(store,row);expect(readDeviceWorking(store)).toEqual([{...row,snapshot:validateSnapshot(row.snapshot)}]);});
  it("updates a stable device ID without duplicating it",()=>{const store=memory();saveDeviceWorking(store,row);saveDeviceWorking(store,{...row,name:"Revised slab"});expect(readDeviceWorking(store)).toHaveLength(1);expect(readDeviceWorking(store)[0].name).toBe("Revised slab");});
  it("removes only the requested record and permits undo",()=>{const store=memory(),other={...row,id:"10000000-0000-4000-8000-000000000002"};saveDeviceWorking(store,row);saveDeviceWorking(store,other);removeDeviceWorking(store,row.id);expect(readDeviceWorking(store).map(r=>r.id)).toEqual([other.id]);saveDeviceWorking(store,row);expect(readDeviceWorking(store)).toHaveLength(2);});
  it("rejects invalid calculations",()=>{const store=memory();expect(()=>saveDeviceWorking(store,{...row,snapshot:{...row.snapshot,values:{...row.snapshot.values,length:-10}}})).toThrow();expect(readDeviceWorking(store)).toEqual([]);});
  it("does not overwrite a damaged library",()=>{const store=memory();store.setItem(DEVICE_WORKING_KEY,"damaged");expect(()=>saveDeviceWorking(store,row)).toThrow();expect(store.getItem(DEVICE_WORKING_KEY)).toBe("damaged");});
  it("reports storage quota failures",()=>{expect(()=>saveDeviceWorking({getItem:()=>null,setItem:()=>{throw new Error("quota");}},row)).toThrow("quota");});
});

it("restores backups atomically and preserves newer device working",()=>{const store=memory();saveDeviceWorking(store,{...row,name:"Newer",updated_at:"2026-09-10T00:00:00Z"});expect(importDeviceWorking(store,{version:1,calculations:[row]})).toBe(0);expect(readDeviceWorking(store)[0].name).toBe("Newer");expect(()=>importDeviceWorking(store,{version:1,calculations:[row,{broken:true}]})).toThrow();expect(readDeviceWorking(store)).toHaveLength(1);});
