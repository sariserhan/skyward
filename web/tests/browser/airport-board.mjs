/** Airport flight board interaction checks; no real schedule provider is called. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url),{chromium}=require(process.env.SKYWARD_QA_PLAYWRIGHT||'playwright');
const artifacts=await mkdtemp(join(tmpdir(),'airport-board-')),port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SKYWARD_PUBLIC_ORIGIN:origin,SKYWARD_FLIGHT_CATALOG_PATH:join(artifacts,'flights.json')},stdio:'ignore'});
let browser;
try{
 for(let n=0;n<60;n++){try{if((await fetch(origin+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 let available=true,paid=true,requests=0,fail=false,hold=false,release;
 await page.route('**/api/account',r=>r.fulfill({json:{liveDetailsReady:available,user:paid?{premium:true}:null}}));
 await page.route('**/api/premium/schedules',async r=>{
  requests++;const body=r.request().postDataJSON();assert.equal(body.airport,'IAD');assert.equal(r.request().method(),'POST');if(hold)await new Promise(resolve=>{release=resolve;});
  if(fail)return r.fulfill({status:503,json:{error:'Schedule service unavailable.'}});
  const side=body.direction==='departures'?'departure':'arrival',other=side==='departure'?'arrival':'departure';
  await r.fulfill({json:{airport:'IAD',direction:body.direction,fetchedAt:Date.now(),flights:[{callsign:'UAL10',number:'UA10',status:'scheduled',[side]:{airport:'IAD',scheduledAt:Date.parse('2026-10-02T00:00:00Z'),estimatedAt:Date.parse('2026-10-02T00:15:00Z'),terminal:'1',gate:'C12'},[other]:{airport:'LHR',city:'London',name:'Heathrow'}},{callsign:'BAW20',status:'cancelled',[side]:{airport:'IAD',scheduledAt:Date.parse('2026-10-02T01:00:00Z'),gate:null},[other]:{airport:'JFK',city:'New York'}}]}});
 });
 await page.goto(origin+'/airports/IAD/board/');assert.match(await page.title(),/IAD arrivals & departures/);const load=page.locator('#board-refresh');await load.waitFor();await page.waitForFunction(()=>!document.querySelector('#board-refresh').disabled);assert.equal(requests,0);
 await load.click();await page.getByRole('link',{name:'UA10',exact:true}).waitFor();assert.equal(requests,1);assert.match(await page.locator('#board-rows').innerText(),/20:00/);assert.match(await page.locator('#board-rows').innerText(),/C12/);assert.match(await page.locator('#board-rows').innerText(),/Not supplied/);
 await page.getByRole('searchbox',{name:'Find a flight'}).fill('London');assert.equal(await page.locator('#board-rows tr').count(),1);await page.getByRole('searchbox',{name:'Find a flight'}).fill('no-match');assert.match(await page.locator('#board-empty').innerText(),/No flights match/);await page.getByRole('searchbox',{name:'Find a flight'}).fill('');
 await page.screenshot({path:join(artifacts,'desktop.png'),fullPage:true});
 fail=true;await load.click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Previous rows are retained/);assert.equal(await page.locator('#board-rows tr').count(),2);fail=false;
 hold=true;await load.click();await page.getByRole('tab',{name:'Arrivals'}).click();assert.equal(await page.locator('#board-rows tr').count(),0);await page.waitForTimeout(100);release();hold=false;await page.waitForFunction(()=>!document.querySelector('#board-refresh').disabled);assert.equal(await page.locator('#board-rows tr').count(),0);
 await load.click();await page.getByRole('link',{name:'UA10',exact:true}).waitFor();assert.equal(await page.locator('#board-place').textContent(),'Origin');assert.equal(requests,4);
 await page.getByRole('tab',{name:'Arrivals'}).focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('tab',{name:'Departures'}).getAttribute('aria-selected'),'true');assert.equal(requests,4);
 if(await page.evaluate(()=>document.fullscreenEnabled)){await page.getByRole('button',{name:'Full screen',exact:true}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.getByRole('button',{name:'Exit full screen',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(artifacts,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 available=false;await page.reload();await page.getByRole('status').filter({hasText:'Live airport schedules are not available yet.'}).waitFor();assert.ok(await load.isDisabled());assert.equal(requests,4);
 available=true;paid=false;await page.reload();await page.getByRole('link',{name:'Sign in / Premium'}).waitFor();assert.ok(await load.isDisabled());assert.equal(requests,4);
 assert.equal(await page.locator('vite-error-overlay,.recovery-screen').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: local times, gates, search, direction races, retained failures, keyboard tabs, full screen, mobile, access gates, no automatic paid lookups. Evidence: '+artifacts);
}finally{await browser?.close();server.kill();}
