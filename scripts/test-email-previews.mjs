import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const directory=process.env.T2Q_EMAIL_PREVIEW_DIR;if(!directory)throw new Error('Set T2Q_EMAIL_PREVIEW_DIR to the generated fixture preview directory.');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:390,height:1000}});for(const kind of ['quote','invoice','request']){await page.setContent(await readFile(resolve(directory,`email-${kind}-preview.html`),'utf8'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(directory,`email-${kind}-preview.png`),fullPage:true});}console.log('PASS: three email HTML previews fit a 390 px viewport. Provider delivery was not invoked.');}finally{await browser.close();}
