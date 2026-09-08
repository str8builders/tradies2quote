/* T2QCAL's public calculator cache. Never cache accounts, APIs or saved URLs. */
const CACHE = "t2qcal-web-20260909-native-2";
const HOME = "/t2qcal/calculators";
const OFFLINE = "/t2qcal/offline.html";
const publicPage = url => !url.search && (url.pathname === "/t2qcal" || [HOME,"/t2qcal/device","/t2qcal/install","/t2qcal/jobs","/t2qcal/measure","/t2qcal/resources"].includes(url.pathname) || /^\/t2qcal\/calculator\/[a-z0-9-]+$/.test(url.pathname));
const staticAsset = url => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/t2qcal/fonts/") || /^\/t2qcal\/(icon-\d+|apple-touch-icon|native-mark|native-icon)\.png$/.test(url.pathname);
async function warmPage(path) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin || !publicPage(url)) return;
  const response = await fetch(url.href, {cache:"reload"});
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html")) return;
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  await cache.put(url.href, response);
  const assets = [...html.matchAll(/(?:src|href)="([^"<>]+)"/g)].map(match => new URL(match[1].replaceAll("&amp;","&"),url)).filter(asset=>asset.origin===url.origin && staticAsset(asset));
  await Promise.all([...new Set(assets.map(asset=>asset.href))].map(async href=>{
    const asset=await fetch(href);if(asset.ok)await cache.put(href,asset);
  }));
}
self.addEventListener("install",event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll([OFFLINE,"/t2qcal/native-icon.png","/t2qcal/native-mark.png"]);
  await Promise.all([warmPage(HOME),warmPage("/t2qcal/device"),warmPage("/t2qcal/install"),warmPage("/t2qcal/jobs"),warmPage("/t2qcal/measure"),warmPage("/t2qcal/resources")]);
  await self.skipWaiting();
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  // Only remove this app's previous caches, never Tradies2Quote's data.
  for(const key of await caches.keys())if(key.startsWith("t2qcal-web-")&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("message",event=>{
  if(event.data?.type==="WARM_PUBLIC_PAGE"&&typeof event.data.path==="string")event.waitUntil(warmPage(event.data.path).catch(()=>{}));
});
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin)return;
  // RSC, APIs and all account-specific navigation remain network-only.
  if(request.mode==="navigate"&&publicPage(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{const response=await fetch(request);if(response.ok&&!response.redirected&&response.headers.get("content-type")?.includes("text/html"))await cache.put(url.href,response.clone());return response;}
      catch{return await cache.match(url.href)||await cache.match(OFFLINE)||Response.error();}
    })());
  } else if(staticAsset(url)&&!url.search){
    event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(url.href);if(saved)return saved;const response=await fetch(request);if(response.ok)await cache.put(url.href,response.clone());return response;})());
  } else if(request.mode==="navigate"&&url.pathname.startsWith("/t2qcal/")){
    event.respondWith(fetch(request).catch(async()=>await(await caches.open(CACHE)).match(OFFLINE)||Response.error()));
  }
});
