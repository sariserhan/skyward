/** Airline flight board interaction checks; no real schedule provider is called. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url),{chromium}=require(process.env.SKYWARD_QA_PLAYWRIGHT||'playwright');
const artifacts=await mkdtemp(join(tmpdir(),'airline-board-')),port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SKYWARD_PUBLIC_ORIGIN:origin,SKYWARD_FLIGHT_CATALOG_PATH:join(artifacts,'flights.json')},stdio:'ignore'});
let browser;
try{
 for(let n=0;n<60;n++){try{if((await fetch(origin+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 let available=true,requests=0,fail=false,wrong=false;
 await page.route('**/api/account',r=>r.fulfill({json:{liveDetailsReady:available,user:{premium:true}}}));
 await page.route('**/api/premium/airline-schedules',async r=>{
  requests++;assert.deepEqual(r.request().postDataJSON(),{airline:'THY'});assert.equal(r.request().method(),'POST');if(fail)return r.fulfill({status:503,json:{error:'Schedule service unavailable.'}});
  const now=Date.now(),hour=3600000,flight=(callsign,status,departure,extra={})=>({callsign,number:'TK'+callsign.slice(3),status,departure:{airport:'IST',city:'Istanbul',scheduledAt:departure,gate:'A12',terminal:'1'},arrival:{airport:'IAD',city:'Washington',scheduledAt:now+6*hour,gate:'B20'},...extra});
  await r.fulfill({json:{airline:wrong?'UAL':'THY',fetchedAt:now,flights:[flight('THY7','active',now-2*hour,{aircraftType:'B789',registration:'TC-TEST'}),flight('THY8','scheduled',now+3*hour),flight('THY9','cancelled',now+2*hour),flight('THY10','scheduled',now-hour,{departure:{airport:'IST',city:'Istanbul',scheduledAt:now-hour,estimatedAt:now+hour}}),flight('THY11','scheduled',null)]}});
 });
 await page.goto(origin+'/airlines/');await page.getByRole('link',{name:/Turkish Airlines/}).click();assert.ok(page.url().endsWith('/airlines/THY/'));assert.match(await page.title(),/Turkish Airlines/);
 const load=page.locator('#board-refresh');await page.waitForFunction(()=>!document.querySelector('#board-refresh').disabled);assert.equal(requests,0);await load.click();await page.getByRole('link',{name:'TK7',exact:true}).waitFor();assert.equal(await page.locator('#board-rows tr').count(),5);assert.equal(requests,1);
 assert.match(await page.locator('#board-rows').innerText(),/Istanbul/);assert.match(await page.locator('#board-rows').innerText(),/Washington/);assert.match(await page.locator('#board-rows').innerText(),/TC-TEST/);assert.match(await page.locator('#board-rows').innerText(),/Not supplied/);assert.match(await page.locator('#board-caption').innerText(),/UTC/);
 await page.getByRole('tab',{name:'Active',exact:true}).click();assert.equal(await page.locator('#board-rows tr').count(),1);await page.getByRole('tab',{name:'Upcoming',exact:true}).click();assert.equal(await page.locator('#board-rows tr').count(),2);assert.equal(requests,1);
 await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'All supplied'}).getAttribute('aria-selected'),'true');
 await page.getByRole('searchbox').fill('B789');assert.equal(await page.locator('#board-rows tr').count(),1);await page.getByRole('searchbox').fill('');
 await page.screenshot({path:join(artifacts,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(artifacts,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 fail=true;await load.click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Previous rows are retained/);assert.equal(await page.locator('#board-rows tr').count(),5);
 fail=false;wrong=true;await load.click();await page.getByRole('alert').filter({hasText:'could not be verified'}).waitFor();assert.equal(await page.locator('#board-rows tr').count(),5);
 available=false;await page.reload();await page.getByRole('status').filter({hasText:'Live airline schedules are not available yet.'}).waitFor();assert.ok(await load.isDisabled());assert.equal(requests,3);
 assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay,.recovery-screen').count(),0);
 console.log('PASS: airline directory, active/upcoming filters, UTC dates, route/aircraft fields, missing data, search, keyboard tabs, mobile, retained errors, airline identity, access gate, no automatic paid lookups. Evidence: '+artifacts);
}finally{await browser?.close();server.kill();}
