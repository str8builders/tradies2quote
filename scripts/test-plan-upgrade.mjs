import {chromium,webkit,expect} from '@playwright/test';
import {PDFDocument,rgb} from 'pdf-lib';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {planTestOrigin} from './plan-test-origin.mjs';
const engine=process.env.T2Q_BROWSER??'chromium';
assert.ok(['chromium','webkit'].includes(engine),'T2Q_BROWSER must be chromium or webkit');
const upstream=process.env.T2Q_BASE_URL??'http://127.0.0.1:3128';
const originGate=engine==='webkit'&&process.env.T2Q_CHECK_OFFLINE?await planTestOrigin(upstream):null;
const base=originGate?.origin??upstream;
const output=process.env.T2Q_TEST_OUTPUT_DIR??'../../outputs';
await mkdir(output,{recursive:true});
const pdf=await PDFDocument.create();for(let i=0;i<2;i++){const page=pdf.addPage([400,300]);page.drawRectangle({x:100,y:100,width:100,height:50,borderColor:rgb(0,0,0),borderWidth:1});page.drawText('Fixture plan — 10 m reference',{x:50,y:250,size:12});}
const bytes=Buffer.from(await pdf.save());
const browser=await ({chromium,webkit}[engine]).launch({...(engine==='chromium'&&process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
// WebKit routing does not reliably intercept fetches once a service worker
// controls the page. Stub only these fixture APIs at the page boundary so the
// real PDF runtime, IndexedDB and service-worker paths stay fully exercised.
await page.addInitScript(()=>{
 localStorage.setItem('t2q-cookie-consent','declined');
 const original=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
  const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href).pathname;
  if(path==='/api/t2qcal/account')return Response.json({account:null});
  if(path.startsWith('/api/t2qcal/quotes/')&&init?.method==='PUT'){
   window.__t2qLastHandoff=JSON.parse(String(init.body));
   return Response.json({id:'11112222-3333-4444-8555-666677778888'});
  }
  return original(input,init);
 };
});
async function point(x,y){await page.getByLabel('X',{exact:true}).fill(String(x));await page.getByLabel('Y',{exact:true}).fill(String(y));await page.getByRole('button',{name:'Add point',exact:true}).click();}
try{
 await page.goto(`${base}/t2qcal/takeoff`);await expect(page.getByLabel('Open PDF (up to 20 MB)')).toBeEnabled();await page.getByLabel('Open PDF (up to 20 MB)').setInputFiles({name:'Fixture.pdf',mimeType:'application/pdf',buffer:bytes});
 await page.getByText('PDF opened locally.',{exact:false}).waitFor();await page.locator('[data-testid="plan-canvas"] canvas').waitFor();
 await page.getByText('Enter a point by coordinate',{exact:true}).click();await point(0,0);await point(100,0);await page.getByLabel('Known distance (m)').fill('10');await page.getByRole('button',{name:'Apply calibration'}).click();
 await page.getByLabel('Tool',{exact:true}).selectOption('rectangle');await point(100,100);await point(200,150);await page.getByLabel('Measurement label').fill('Kitchen floor');await page.getByRole('button',{name:'Finish measurement'}).click();await page.getByText('50 m²',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Save plan on device'}).click();await page.getByRole('button',{name:'Saved on device',exact:true}).waitFor();
 await page.getByRole('button',{name:'Rotate 90°'}).click();await page.getByLabel('Zoom',{exact:true}).selectOption('2');await page.getByText('50 m²',{exact:true}).first().waitFor();
 await page.getByLabel('Tool',{exact:true}).selectOption('length');await page.getByLabel('Measurement label').fill('Rotated line');
 await page.locator('[data-testid="plan-canvas"] canvas').waitFor();await page.waitForTimeout(300);
 const surface=page.getByTestId('plan-canvas'),box=await surface.boundingBox(),scale=box.width/300;
 await surface[process.env.T2Q_POINTER==='mouse'?'click':'tap']({position:{x:50*scale,y:25*scale}});await page.getByText('1 points marked',{exact:true}).waitFor();await surface[process.env.T2Q_POINTER==='mouse'?'click':'tap']({position:{x:50*scale,y:75*scale}});await page.getByRole('button',{name:'Finish measurement'}).click();const measured=Number.parseFloat(await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Rotated line',exact:true})}).locator('p').innerText());assert.ok(Math.abs(measured-5)<0.05,`Rotated pointer distance: ${measured}`);
 // Editing while file IO is pending must keep the newer working visibly unsaved.
 await page.evaluate(()=>{const original=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){Blob.prototype.arrayBuffer=original;return new Promise((resolve,reject)=>{window.__t2qReleaseRead=()=>original.call(this).then(resolve,reject);});};});
 await page.getByRole('button',{name:'Save plan on device'}).click();await page.waitForFunction(()=>typeof window.__t2qReleaseRead==='function');
 await page.getByRole('button',{name:'Undo last completed measurement'}).click();await page.evaluate(()=>window.__t2qReleaseRead());
 await expect(page.getByRole('button',{name:'Save plan on device'})).toBeEnabled();
 await page.getByText('Earlier measurements saved. Save again to include your latest edits.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Save plan on device'}).click();await page.getByRole('button',{name:'Saved on device',exact:true}).waitFor();
 await page.getByRole('button',{name:'Use Kitchen floor in a quote'}).click();
 await page.getByRole('button',{name:'Create quote draft',exact:true}).click();await page.getByRole('link',{name:'Review draft in Tradies2Quote'}).waitFor();const transfer=await page.evaluate(()=>window.__t2qLastHandoff);assert.equal(transfer.snapshot.values.quantity,50);assert.equal(transfer.snapshot.planSource.page,1);assert.equal(transfer.snapshot.planSource.fileHash.length,64);
 const exported=page.waitForEvent('download');await page.getByRole('button',{name:'Export measurements',exact:true}).click();const download=await exported;const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk;const backup=JSON.parse(text);assert.equal(backup.annotations.measurements.length,1);
 await page.getByLabel('Page',{exact:true}).selectOption('2');await page.getByText('Page 2 needs calibration for length and area. Counts do not need scale.').waitFor();
 await page.reload();await page.getByLabel('Device plans',{exact:true}).selectOption(backup.fileHash);await page.getByText('50 m²',{exact:true}).first().waitFor();
 if(process.env.T2Q_CHECK_OFFLINE){
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  await page.getByText('Offline plan viewing ready.',{exact:true}).waitFor();
  await page.waitForFunction(async()=>Boolean(await caches.match(location.href)));
  const forwarded=originGate?.disconnect();
  if(!originGate)await context.setOffline(true);
  else await assert.rejects(fetch(`${base}/__offline-probe`));
  await page.reload();await page.getByLabel('Device plans',{exact:true}).selectOption(backup.fileHash);await page.getByText('50 m²',{exact:true}).first().waitFor();await page.locator('[data-testid="plan-canvas"] canvas').waitFor();if(originGate){assert.equal(originGate.stats().forwarded,forwarded);assert.ok(originGate.stats().blocked>0);originGate.reconnect();}else await context.setOffline(false);
 }
 await page.getByLabel('Zoom',{exact:true}).selectOption('1');await page.screenshot({path:join(output,`${engine}-plan-takeoff-mobile.png`),fullPage:true});
 assert.deepEqual(errors,[]);console.log(`Browser: ${engine}; input: ${process.env.T2Q_POINTER??'touch'}; offline: ${process.env.T2Q_CHECK_OFFLINE?(originGate?'upstream disconnected':'browser network disabled'):'not requested'}`);console.log('PASS: PDF render, keyboard calibration, measured area, zoom/rotation invariance, page scale isolation, quote provenance, export and device reload.');
}catch(e){console.log("PAGE",await page.locator("main").innerText());console.log("ERRORS",errors);await page.screenshot({path:join(output,`${engine}-plan-failure.png`),fullPage:true});throw e;}finally{await browser.close();await originGate?.close();}
