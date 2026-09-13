/**
 * Offline document store for the T2QCAL reference library.
 *
 * Documents are cached under one long-lived Cache Storage name that the
 * service worker never wipes on upgrade (its page caches are versioned and
 * replaced; this one is the tradie's own shelf). The worker serves any
 * request under DOC_PREFIX cache-first, so a kept document opens on site
 * with no signal.
 */
export const DOCS_CACHE="t2qcal-docs-v1";
export const DOC_PREFIX="/t2qcal/resources/file/";

export type LibraryResource={id:string;title:string;publisher:string;detail:string;note:string;group:string;groupName:string;page:string;pdf:string};

export const documentPath=(id:string)=>`${DOC_PREFIX}${encodeURIComponent(id)}`;

export function hasDocumentStore(){
  return typeof window!=="undefined"&&"caches"in window&&window.isSecureContext;
}

/** Ids of every document currently kept offline. */
export async function listKeptDocuments():Promise<Set<string>>{
  const cache=await caches.open(DOCS_CACHE);
  const keys=await cache.keys();
  const kept=new Set<string>();
  for(const request of keys){
    const url=new URL(request.url);
    if(url.pathname.startsWith(DOC_PREFIX))kept.add(decodeURIComponent(url.pathname.slice(DOC_PREFIX.length)));
  }
  return kept;
}

/** Download one document through the in-scope proxy and store it. Throws a readable message. */
export async function keepDocument(id:string):Promise<number>{
  const cache=await caches.open(DOCS_CACHE);
  const url=new URL(documentPath(id),window.location.origin).href;
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(120_000)});
  if(!response.ok)throw new Error(response.status===429?"Too many downloads at once. Wait a moment and try again.":(await response.text().catch(()=>""))||"This document could not be downloaded.");
  if(!(response.headers.get("content-type")??"").includes("pdf"))throw new Error("The publisher did not return a PDF.");
  const body=await response.arrayBuffer();
  if(body.byteLength<1024)throw new Error("The publisher returned an empty document.");
  await cache.put(url,new Response(body,{status:200,headers:{"Content-Type":"application/pdf","Content-Length":String(body.byteLength),"X-T2QCAL-Kept":new Date().toISOString()}}));
  return body.byteLength;
}

export async function removeDocument(id:string):Promise<void>{
  const cache=await caches.open(DOCS_CACHE);
  await cache.delete(new URL(documentPath(id),window.location.origin).href);
}

export async function storageSummary():Promise<{usage:number;quota:number}|null>{
  try{if(!navigator.storage?.estimate)return null;const {usage=0,quota=0}=await navigator.storage.estimate();return {usage,quota};}catch{return null;}
}

export function formatBytes(bytes:number){
  if(bytes<1024*1024)return `${Math.max(1,Math.round(bytes/1024))} KB`;
  if(bytes<1024*1024*1024)return `${(bytes/1024/1024).toFixed(bytes<10*1024*1024?1:0)} MB`;
  return `${(bytes/1024/1024/1024).toFixed(1)} GB`;
}

export function matchesQuery(resource:LibraryResource,query:string){
  const q=query.trim().toLowerCase();
  if(!q)return true;
  return `${resource.title} ${resource.publisher} ${resource.detail} ${resource.groupName}`.toLowerCase().includes(q);
}
