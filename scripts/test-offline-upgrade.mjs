import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(30000);await page.addInitScript(()=>localStorage.setItem('t2q-cookie-consent','declined'));
const owner='00112233-4455-4677-8899-aabbccddeeff';let requests=0,conflict=true;
await context.route('**/api/t2qcal/account',route=>route.fulfill({json:{account:{id:owner,email:'fixture@example.test',name:'Fixture',initial:'F',avatar:null}}}));
await context.route('**/api/t2qcal/calculations/*',async route=>{if(route.request().method()!=='PUT')return route.continue();requests++;assert.equal(route.request().headers()['x-t2q-owner'],owner);const input=route.request().postDataJSON();await route.fulfill({status:conflict?409:200,json:conflict?{error:'Changed on another device'}:{record:{...input,id:route.request().url().split('/').at(-1),revision:1,updated_at:new Date().toISOString()}}});});
try{
 await page.goto('http://127.0.0.1:3128/t2qcal/jobs');
 await page.getByRole('button',{name:'Start a job',exact:true}).click();
 await page.getByLabel('What the job is').fill('Offline test job');await page.getByRole('button',{name:'Start',exact:true}).click();
 await page.getByText('Offline test job',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:3128/t2qcal/calculator/concrete-slab');
 await page.getByLabel('Calculation name').fill('Fixture slab');
 await page.getByRole('button',{name:'Save on this device',exact:true}).click();
 await page.getByText('Saved on this device and added to Offline test job.').waitFor();
 await page.waitForTimeout(300);
 await context.setOffline(true);await page.getByRole('button',{name:'Back up to account',exact:true}).click();
 await page.getByText('Account backup pending',{exact:true}).waitFor();assert.equal(requests,0);
 await context.setOffline(false);await page.getByText('Backup conflict — open Your working to resolve it.').waitFor();
 await page.goto('http://127.0.0.1:3128/t2qcal/device');await page.getByRole('heading',{name:'Fixture slab',exact:true}).first().waitFor();
 conflict=false;await page.getByRole('button',{name:'Back up as a new copy'}).click();await page.getByText(/No pending backups for this account/).waitFor();assert.equal(requests,2);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const exported=await download;const stream=await exported.createReadStream();let text='';for await(const chunk of stream)text+=chunk;const data=JSON.parse(text);assert.equal(data.version,2);assert.equal(data.jobs.jobs[0].name,'Offline test job');assert.equal(data.jobs.jobs[0].calculationIds.length,1);
 await page.getByRole('button',{name:'Remove from device'}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).waitFor({state:'hidden'});
 await page.goto('http://127.0.0.1:3128/t2qcal/jobs');await page.getByText('Fixture slab',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: mobile device save, atomic job link, offline queue, online conflict, new-copy resolution, job export and undo.');
}finally{await browser.close();}
