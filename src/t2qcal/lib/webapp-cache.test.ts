import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {it,expect,vi} from "vitest";
const source=readFileSync("public/t2qcal/sw.js","utf8");
function worker(){
 const handlers:Record<string,(event:any)=>void>={}; // eslint-disable-line @typescript-eslint/no-explicit-any
 const entries=new Map<string,Response>([["/t2qcal/offline.html",new Response("offline fallback")]]);
 const cache={match:vi.fn(async(key:string)=>entries.get(key)?.clone()),put:vi.fn(async(key:string,response:Response)=>{entries.set(key,response);})};
 const fetch=vi.fn(async()=>{throw new Error("offline");});
 runInNewContext(source,{self:{location:{origin:"https://example.com"},addEventListener:(name:string,handler:typeof handlers[string])=>{handlers[name]=handler;}},URL,Response,fetch,caches:{open:async()=>cache}});
 function navigate(path:string,mode="navigate"){let result:Promise<Response>|undefined;handlers.fetch({request:{url:`https://example.com${path}`,method:"GET",mode},respondWith:(response:Promise<Response>)=>{result=response;}});return result;}
 return {entries,cache,fetch,navigate};
}
it("reopens an already cached public calculator offline",async()=>{const w=worker();w.entries.set("https://example.com/t2qcal/calculator/straight-stairs",new Response("calculator"));expect(await(await w.navigate("/t2qcal/calculator/straight-stairs")!).text()).toBe("calculator");});
it("never serves public cache for a private saved calculation",async()=>{const w=worker();w.entries.set("https://example.com/t2qcal/calculator/straight-stairs",new Response("calculator"));expect(await(await w.navigate("/t2qcal/calculator/straight-stairs?saved=private")!).text()).toBe("offline fallback");expect(w.cache.put).not.toHaveBeenCalled();});
it("leaves account APIs and the quoting app untouched",()=>{const w=worker();expect(w.navigate("/api/t2qcal/calculations","cors")).toBeUndefined();expect(w.navigate("/app")).toBeUndefined();expect(w.navigate("/login")).toBeUndefined();});
it("shows an honest fallback for an unopened calculator",async()=>{const w=worker();expect(await(await w.navigate("/t2qcal/calculator/concrete-slab")!).text()).toBe("offline fallback");});
it("does not use HTML caching for RSC requests",()=>{const w=worker();expect(w.navigate("/t2qcal/calculators?_rsc=abc","cors")).toBeUndefined();});
it("preloads the native identity and fonts before claiming offline support",async()=>{
 let install:((event:{waitUntil:(p:Promise<void>)=>void})=>void)|undefined;
 const addAll=vi.fn(async(_paths:string[])=>{});
 runInNewContext(source,{self:{location:{origin:"https://example.com"},addEventListener:(name:string,handler:typeof install)=>{if(name==="install")install=handler;},skipWaiting:async()=>{}},URL,Response,fetch:async()=>new Response("",{headers:{"content-type":"text/plain"}}),caches:{open:async()=>({addAll})}});
 let completion:Promise<void>|undefined;install!({waitUntil:p=>{completion=p;}});await completion;
 expect(addAll.mock.calls[0][0]).toEqual(expect.arrayContaining(["/t2qcal/native-icon.png","/t2qcal/native-mark.png","/t2qcal/fonts/ArchivoBlack-Regular.woff2","/t2qcal/fonts/IBMPlexSans.woff2","/t2qcal/fonts/IBMPlexMono-Regular.woff2"]));
});
