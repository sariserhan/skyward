/** Zoom controls integration checks using fixture traffic and an isolated server. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require(process.env.SKYWARD_QA_PLAYWRIGHT||'playwright'));}catch{throw Error('Install Node Playwright in your QA environment or set SKYWARD_QA_PLAYWRIGHT to an existing installation. See tests/browser/README.md.');}
const root=new URL('../../',import.meta.url),artifacts=process.env.SKYWARD_QA_ARTIFACTS||await mkdtemp(join(tmpdir(),'skyward-zoom-'));
await mkdir(artifacts,{recursive:true});
const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',s=>serverLog+=s);server.stderr.on('data',s=>serverLog+=s);
let browser;
const fixture={type:'B738',callsign:'BAW123'};
const init=(await readFile(new URL('tests/browser/regression.py',root),'utf8')).match(/INIT="""([\s\S]*?)"""/)[1];
async function screenshot(page,name){const file=join(artifacts,name+'.png');await page.screenshot({path:file});return file;}
try{
 for(let i=0;i<80;i++){try{if((await fetch(url+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===79)throw Error('Test server did not start');}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  await page.addInitScript("window.addEventListener('error',e=>console.error('Window error: '+e.message+' '+e.filename+':'+e.lineno+' '+e.error?.stack));window.addEventListener('unhandledrejection',e=>console.error('Unhandled promise: '+(e.reason?.stack||e.reason)));"+init+"localStorage.setItem('skyward.flight-view.v1',JSON.stringify({distance:1.15,compact:false}));");
  await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname,stamp=Date.now();let data={items:[],limits:{count:100,bytes:1000000}};
   if(['/api/area','/api/aircraft','/api/search'].includes(path))data={source:'fixture',sourceAt:stamp,fetchedAt:stamp,aircraft:[{hex:'abcdef',callsign:fixture.callsign,registration:'TEST',aircraftType:fixture.type,lat:38.95,lon:-77.8,altitude:35000,ground:false,groundSpeed:350,heading:90,verticalRate:0,observedAt:stamp,sourceType:'visual fixture',category:'A3',targetKind:'aircraft'}]};
   else if(path==='/api/route')data={callsign:fixture.callsign,source:'Test fixture',sourceUrl:'https://example.invalid',fetchedAt:stamp,status:'PLAUSIBLE',airports:[{icao:'KIAD',iata:'IAD',name:'Dulles',lat:38.947,lon:-77.46},{icao:'EGLL',iata:'LHR',name:'Heathrow',lat:51.47,lon:-.45}]};
   else if(path==='/api/special-flights')data={state:'ready',rows:[],checkedAt:stamp};
   else if(path==='/api/account')data={user:new URL(page.url()).pathname==='/flight-simulator/'?{id:'qa',premium:true}:null,flights:[]};
   else if(path==='/api/local-weather')data={status:'unavailable',report:null};
   await r.fulfill({json:data});
  });
  try{
   await page.goto(url+'/#airport=IAD');await page.waitForFunction(()=>window.__viewer);await page.waitForTimeout(2500);
   const button=name=>page.getByRole('button',{name,exact:true});
   const height=()=>page.evaluate(()=>__viewer.camera.positionCartographic.height);
   let before=await height();await button('Zoom in globe').click();await page.waitForTimeout(900);assert.ok(await height()<before);
   before=await height();await button('Zoom out globe').click();await page.waitForTimeout(900);assert.ok(await height()>before);
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await screenshot(page,'globe-mobile');
   assert.ok(await button('Zoom in globe').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await button('Zoom in globe').click();
   await page.setViewportSize({width:1440,height:1000});await button('Tower view').click();await button('Zoom in tower').waitFor();
   await page.waitForTimeout(1500);const fov=await page.evaluate(()=>__viewer.camera.frustum.fov);
   assert.ok(await button('Zoom out tower').isDisabled());await button('Zoom in tower').click();assert.equal(await page.getByLabel('Tower zoom',{exact:true}).inputValue(),'1.25');assert.ok(await page.evaluate(()=>__viewer.camera.frustum.fov)<fov);
   await button('Zoom in tower radar').click();assert.equal(await page.getByLabel('Radar range',{exact:true}).inputValue(),'5');await button('Zoom out tower radar').click();assert.equal(await page.getByLabel('Radar range',{exact:true}).inputValue(),'10');
   await screenshot(page,'tower-desktop');await button('Close tower view').click();await button(`View ${fixture.callsign}`).click();await button('✈ Flight view').click();
   const slider=page.getByRole('slider',{name:'Flight camera distance'});
   before=Number(await slider.inputValue());await button('Zoom in flight camera').click();assert.ok(Number(await slider.inputValue())<before);await button('Zoom out flight camera').click();assert.ok(Math.abs(Number(await slider.inputValue())-before)<.001);
   await slider.fill(await slider.getAttribute('min'));assert.ok(await button('Zoom in flight camera').isDisabled());await slider.fill(await slider.getAttribute('max'));assert.ok(await button('Zoom out flight camera').isDisabled());assert.equal(await page.getByLabel('Flight viewpoint',{exact:true}).inputValue(),'side');
   await page.setViewportSize({width:390,height:844});await button('Zoom in flight camera').click();await screenshot(page,'flight-mobile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   // Serve the app shell for this isolated Premium UI fixture; production gating stays intact.
   await page.route(url+'/flight-simulator/',async route=>route.fulfill({status:200,contentType:'text/html',body:await (await fetch(url+'/')).text()}));
   assert.equal(await page.locator('.background-error-notice').count(),0);await page.goto(url+'/flight-simulator/');await button('Start flight').click();
   await page.getByLabel('View',{exact:true}).selectOption('chase');
   await page.waitForFunction(()=>window.__viewer?.entities?.getById('flight-simulation'));await page.waitForTimeout(1500);
   const range=()=>page.evaluate(()=>{const v=__viewer;return Cesium.Cartesian3.distance(v.camera.positionWC,v.entities.getById('flight-simulation').position.getValue(v.clock.currentTime));});
   before=await range();await button('Zoom in simulator camera').click();await page.waitForTimeout(1000);assert.ok(await range()<before*.9);
   before=await range();await button('Zoom out simulator camera').click();await page.waitForTimeout(1000);assert.ok(await range()>before*1.1);
   await page.getByLabel('View',{exact:true}).selectOption('overhead');await page.waitForTimeout(1500);before=await range();await button('Zoom in simulator camera').click();await page.waitForTimeout(1000);assert.ok(await range()<before*.9);
   await screenshot(page,'simulator-mobile');await page.getByLabel('View',{exact:true}).selectOption('cockpit');assert.equal(await button('Zoom in simulator camera').count(),0);
   assert.equal(await page.locator('.background-error-notice,.cesium-widget-errorPanel,.recovery-screen').count(),0);assert.deepEqual(errors,[]);console.log('PASS globe desktop/mobile, tower optics, radar range, flight buttons and limits, simulator chase/bird cameras');
  }catch(error){console.error('Browser errors:',errors);await screenshot(page,'failure');throw error;}finally{await page.close();}
 }
}finally{await browser?.close();server.kill();await writeFile(join(artifacts,'server.log'),serverLog);console.log('Browser evidence:',artifacts);}
