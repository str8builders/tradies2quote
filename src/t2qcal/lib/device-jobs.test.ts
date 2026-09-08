import {describe,it,expect} from "vitest";
import {readDeviceJobs,createDeviceJob,activateDeviceJob,attachToActiveJob} from "./device-jobs";
function storage(){const entries=new Map<string,string>();return {getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);}};}
describe("device job persistence",()=>{
 it("groups saved calculations under the selected job without duplicate links",()=>{const s=storage(),a=createDeviceJob(s,"Deck","Client"),calculation=crypto.randomUUID();expect(attachToActiveJob(s,calculation)).toBe("Deck");attachToActiveJob(s,calculation);expect(readDeviceJobs(s).jobs[0].calculationIds).toEqual([calculation]);createDeviceJob(s,"Roof","");attachToActiveJob(s,calculation);expect(readDeviceJobs(s).jobs[0].name).toBe("Roof");activateDeviceJob(s,a.activeId);expect(readDeviceJobs(s).activeId).toBe(a.activeId);activateDeviceJob(s,null);expect(attachToActiveJob(s,crypto.randomUUID())).toBeNull();});
 it("preserves damaged storage instead of replacing it",()=>{let raw="not JSON";const s={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};expect(()=>createDeviceJob(s,"Deck","")).toThrow();expect(raw).toBe("not JSON");});
 it("reports a failed disk write without claiming a saved job",()=>{const s={getItem:()=>null,setItem:()=>{throw new Error("Storage full");}};expect(()=>createDeviceJob(s,"Deck","")).toThrow("Storage full");});
});
