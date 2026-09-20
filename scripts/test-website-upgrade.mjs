import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await page.addInitScript(()=>localStorage.setItem('t2q-cookie-consent','declined'));const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3128/',{timeout:120000});const example=page.locator('#worked-example');await example.scrollIntoViewIfNeeded();
 await page.getByLabel('Example length (m)').fill('6');await page.getByLabel('Example width (m)').fill('4');await page.getByLabel('Example rate').fill('50');await example.getByText('$1,200.00',{exact:true}).waitFor();
 assert.equal(await example.getByRole('link',{name:'Try PDF plan takeoff'}).getAttribute('href'),'/t2qcal/takeoff');
 await page.getByLabel('Example width (m)').fill('');await example.getByText('Enter a positive measurement and rate in each field.').waitFor();await page.getByLabel('Example width (m)').fill('4');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.getByLabel('Example width (m)').blur();await example.evaluate(element=>{element.scrollIntoView({block:'start'});window.scrollBy(0,-100);});await page.screenshot({path:'../../outputs/website-workflow-mobile.png'});assert.deepEqual(errors,[]);
 await page.setViewportSize({width:1440,height:1000});await example.scrollIntoViewIfNeeded();await example.screenshot({path:'../../outputs/website-workflow-desktop.png'});
 console.log('PASS: mobile/desktop website example, interactive quantities, invalid-input state, real feature links and no mobile overflow.');
}finally{await browser.close();}
