import catalog from "@/t2qcal/lib/native-catalog.json";
import {consumeFixedWindow} from "@/lib/rate-limit";

export const dynamic="force-dynamic";

/** Publisher PDFs above this are refused rather than half-streamed to a phone. */
const MAX_DOCUMENT_BYTES=150*1024*1024;

/**
 * Same-origin, in-scope copy of a reference PDF from the T2QCAL library.
 *
 * Why a proxy: the manuals are the publishers' own files on the publishers'
 * own hosts. A phone cannot keep one for offline use from there — cross-origin
 * fetches are blocked and the service worker only controls /t2qcal/. Streaming
 * the same bytes from this route puts the document inside the worker's scope,
 * so "Keep offline" on the Resources tab can store it and reopen it on site
 * with no signal. Nothing is stored server-side; each request goes to the
 * publisher, and the catalogue is the allow-list (no arbitrary URLs).
 */
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const resource=catalog.resources.find(r=>r.id===id&&r.pdf);
  if(!resource)return new Response("No such document in the T2QCAL library.",{status:404,headers:{"Cache-Control":"no-store"}});
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-real-ip")||"local";
  if(!consumeFixedWindow(`t2qcal:document:${ip}`,120,15*60_000).ok)return new Response("Please wait a moment and try again.",{status:429,headers:{"Cache-Control":"no-store"}});
  let upstream:Response;
  try{upstream=await fetch(resource.pdf,{headers:{Accept:"application/pdf,*/*;q=0.8","User-Agent":"Mozilla/5.0 (compatible; T2QCAL reference library; +https://tradies2quote.com/t2qcal/resources)"},redirect:"follow",cache:"no-store",signal:AbortSignal.timeout(45_000)});}
  catch{return new Response("The publisher's site did not respond. Try again when you have a better connection.",{status:504,headers:{"Cache-Control":"no-store"}});}
  const type=(upstream.headers.get("content-type")??"").toLowerCase();
  if(!upstream.ok||!upstream.body||!(type.includes("pdf")||type.includes("octet-stream"))){
    upstream.body?.cancel().catch(()=>{});
    return new Response("The publisher no longer serves this document at its listed address. Use the Open link to find it on their site.",{status:502,headers:{"Cache-Control":"no-store"}});
  }
  const length=upstream.headers.get("content-length");
  if(length&&Number(length)>MAX_DOCUMENT_BYTES){await upstream.body.cancel().catch(()=>{});return new Response("This document is too large to keep on a phone.",{status:502,headers:{"Cache-Control":"no-store"}});}
  const filename=resource.title.replace(/[^A-Za-z0-9 _.-]+/g,"").trim().replace(/\s+/g,"-").slice(0,80)||resource.id;
  const headers:Record<string,string>={
    "Content-Type":"application/pdf",
    "Content-Disposition":`inline; filename="${filename}.pdf"`,
    "Cache-Control":"public, max-age=86400, stale-while-revalidate=604800",
    "X-Content-Type-Options":"nosniff",
    "X-T2QCAL-Publisher":resource.publisher,
  };
  // The body is streamed decoded; only pass a length the client will actually receive.
  if(length&&!upstream.headers.get("content-encoding"))headers["Content-Length"]=length;
  return new Response(upstream.body,{status:200,headers});
}
