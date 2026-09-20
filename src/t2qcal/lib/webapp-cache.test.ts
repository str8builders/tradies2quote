import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {it,expect,vi} from "vitest";
const source=readFileSync("public/t2qcal/sw.js","utf8");
function worker(){
 const handlers:Record<string,(event:any)=>void>={}; // eslint-disable-line @typescript-eslint/no-explicit-any
 const entries=new Map<string,Response>([["/t2qcal/offline.html",new Response("offline fallback")]]);
 const cache={match:vi.fn(async(key:string)=>entries.get(key)?.clone()),put:vi.fn(async(key:string,response:Response)=>{entries.set(key,response);})};
 const fetch=vi.fn<(url:string)=>Promise<Response>>(async()=>{throw new Error("offline");});
 runInNewContext(source,{self:{location:{origin:"https://example.com"},addEventListener:(name:string,handler:typeof handlers[string])=>{handlers[name]=handler;}},URL,Response,fetch,caches:{open:async()=>cache}});
 function navigate(path:string,mode="navigate"){let result:Promise<Response>|undefined;handlers.fetch({request:{url:`https://example.com${path}`,method:"GET",mode},respondWith:(response:Promise<Response>)=>{result=response;}});return result;}
 async function warmPdf(){let completion:Promise<void>|undefined;const reply=vi.fn();handlers.message({data:{type:"WARM_PDF_ENGINE"},ports:[{postMessage:reply}],waitUntil:(value:Promise<void>)=>{completion=value;}});await completion;return reply.mock.calls[0][0].ok as boolean;}
 return {entries,cache,fetch,navigate,warmPdf};
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
it("opens a kept reference document from the shelf with no network",async()=>{const w=worker();w.entries.set("https://example.com/t2qcal/resources/file/gib-site-guide",new Response("%PDF-kept"));expect(await(await w.navigate("/t2qcal/resources/file/gib-site-guide")!).text()).toBe("%PDF-kept");expect(w.fetch).not.toHaveBeenCalled();});
it("explains when a document was never kept and the network is gone",async()=>{const w=worker();const response=await w.navigate("/t2qcal/resources/file/mitek-residential")!;expect(response.status).toBe(503);expect(await response.text()).toContain("Keep offline");});
it("never wipes the kept-document shelf when the page cache is replaced",()=>{expect(source).toMatch(/key\.startsWith\("t2qcal-web-"\)/);expect(source).toContain('"t2qcal-docs-v1"');});

it("only reports offline PDF readiness after every runtime asset is cached, and retries partial downloads",async()=>{
 const w=worker();let unavailable=true;
 w.fetch.mockImplementation(async url=>url.endsWith("assets.json")?Response.json(["pdf.worker.min.mjs","standard_fonts/font.pfb"]):url.endsWith("font.pfb")&&unavailable?new Response("unavailable",{status:503}):new Response("asset bytes"));
 expect(await w.warmPdf()).toBe(false);
 unavailable=false;expect(await w.warmPdf()).toBe(true);
 w.fetch.mockClear();expect(await w.warmPdf()).toBe(true);expect(w.fetch).not.toHaveBeenCalled();
});
it("rejects a PDF runtime manifest that points outside its public asset directory",async()=>{
 const w=worker();w.fetch.mockResolvedValue(Response.json(["../../api/t2qcal/account"]));expect(await w.warmPdf()).toBe(false);expect(w.cache.put).not.toHaveBeenCalled();
});
