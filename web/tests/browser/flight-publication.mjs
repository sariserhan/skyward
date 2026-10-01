/** Public flight profiles: server HTML, indexing, responsive layout and shared cameras. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url),{chromium}=require(process.env.SKYWARD_QA_PLAYWRIGHT||'playwright');
const dir=await mkdtemp(join(tmpdir(),'flight-seo-browser-')),file=join(dir,'flights.json'),stamp=Date.now();
await writeFile(file,JSON.stringify([{code:'JBU2117',airports:['IAD','JFK'],observedAt:stamp,routeCheckedAt:stamp,hex:'abcdef',aircraftType:'A320',registration:'NTEST'}]));
const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SKYWARD_PUBLIC_ORIGIN:origin,SKYWARD_FLIGHT_CATALOG_PATH:file},stdio:'ignore'});
let browser;
try{
 for(let n=0;n<60;n++){try{if((await fetch(origin+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const js of [false,true]){
  const page=await browser.newPage({javaScriptEnabled:js,viewport:{width:1440,height:1000}}),errors=[],api=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});
  await page.goto(origin+'/flights/JBU2117/');assert.ok(await page.getByRole('heading',{name:'Last retained aircraft observation'}).isVisible());
  assert.equal(await page.locator('meta[name="robots"]').count(),0);assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),origin+'/flights/JBU2117/');
  assert.equal(await page.getByRole('link',{name:'Look for JBU2117 on the live globe'}).getAttribute('href'),'/flights/JBU2117/?live=1');
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});if(js)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(dir,`profile-${js?'js':'nojs'}-${width}.png`),fullPage:true});}
  await page.goto(origin+'/flights/');await page.getByRole('link',{name:/JBU2117/}).click();assert.ok(page.url().endsWith('/flights/JBU2117/'));
  assert.deepEqual(errors,[]);assert.deepEqual(api,[]);
  if(js){await page.route('**/flights/JBU2117/?live=1',r=>r.fulfill({body:'Shared live-view fixture'}));await page.goto(origin+'/flights/JBU2117/#scene=flight&view=side');await page.waitForURL('**/flights/JBU2117/?live=1#scene=flight&view=side');}
  await page.close();
 }
 const sitemap=await (await fetch(origin+'/sitemap.xml')).text();assert.ok(sitemap.includes(origin+'/flights/JBU2117/'));
 const unknown=await (await fetch(origin+'/flights/UNKNOWN1/')).text();assert.ok(unknown.includes('noindex,follow'));
 console.log('PASS: server HTML, JS/no-JS, desktop/mobile, directory links, canonical metadata, sitemap, shared camera fragments, zero aviation API requests. Evidence: '+dir);
}finally{await browser?.close();server.kill();}
