/** Deterministic aircraft close-up QA. Uses an existing Node Playwright installation. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require(process.env.SKYWARD_QA_PLAYWRIGHT||'playwright'));}catch{throw Error('Install Node Playwright in your QA environment or set SKYWARD_QA_PLAYWRIGHT to an existing installation. See tests/browser/README.md.');}
const root=new URL('../../',import.meta.url),artifacts=process.env.SKYWARD_QA_ARTIFACTS||await mkdtemp(join(tmpdir(),'skyward-aircraft-'));
await mkdir(artifacts,{recursive:true});
const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',s=>serverLog+=s);server.stderr.on('data',s=>serverLog+=s);
let browser;const results=[];
const matrix=[{type:'B738',callsign:'BAW123',name:'dark-livery'},{type:'B788',callsign:'UAL123',name:'widebody-logo'},{type:'CRJ9',callsign:'DAL123',name:'t-tail'},{type:'C172',callsign:'NTEST1',name:'small-aircraft'}];
const times=[['day','2026-09-29T17:00:00Z'],['dusk','2026-09-29T23:15:00Z'],['night','2026-09-29T05:00:00Z']];
const init=(await readFile(new URL('tests/browser/regression.py',root),'utf8')).match(/INIT="""([\s\S]*?)"""/)[1];
async function screenshot(page,name){const file=join(artifacts,name+'.png');await page.screenshot({path:file});return file;}
async function pixels(page,buffer){return page.evaluate(async base64=>{const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return {width:img.width,height:img.height,data:Array.from(ctx.getImageData(0,0,img.width,img.height).data)};},buffer.toString('base64'));}
// A wide solid-black band in the middle of the canvas is the mobile artifact,
// not a dark sky. Require many contiguous pixels and rows, excluding page chrome.
function blackBand(image){let consecutive=0;for(let y=100;y<Math.min(410,image.height);y++){let run=0,longest=0;for(let x=15;x<image.width-15;x++){const i=(y*image.width+x)*4;run=image.data[i]===0&&image.data[i+1]===0&&image.data[i+2]===0?run+1:0;longest=Math.max(longest,run);}consecutive=longest>image.width*.7?consecutive+1:0;if(consecutive>=12)return true;}return false;}
try{
 for(let i=0;i<80;i++){try{if((await fetch(url+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===79)throw Error('Test server did not start');}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const fixture of matrix){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(init+"localStorage.setItem('skyward.flight-view.v1',JSON.stringify({distance:1.15,compact:false}));");
  await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname,stamp=Date.now();let data={};
   if(['/api/area','/api/aircraft','/api/search'].includes(path))data={source:'fixture',sourceAt:stamp,fetchedAt:stamp,aircraft:[{hex:'abcdef',callsign:fixture.callsign,registration:'TEST',aircraftType:fixture.type,lat:38.95,lon:-77.8,altitude:35000,ground:false,groundSpeed:350,heading:90,verticalRate:0,observedAt:stamp,sourceType:'visual fixture',category:'A3',targetKind:'aircraft'}]};
   else if(path==='/api/route')data={callsign:fixture.callsign,source:'Test fixture',sourceUrl:'https://example.invalid',fetchedAt:stamp,status:'PLAUSIBLE',airports:[{icao:'KIAD',iata:'IAD',name:'Dulles',lat:38.947,lon:-77.46},{icao:'EGLL',iata:'LHR',name:'Heathrow',lat:51.47,lon:-.45}]};
   else if(path==='/api/special-flights')data={state:'ready',rows:[],checkedAt:stamp};
   else if(path==='/api/local-weather')data={status:'unavailable',report:null};
   await r.fulfill({json:data});
  });
  try{
   await page.goto(url+'/#airport=IAD');await page.getByRole('button',{name:`View ${fixture.callsign}`,exact:true}).click({timeout:60000});await page.getByRole('button',{name:'✈ Flight view',exact:true}).click();
   await page.waitForFunction(()=>__viewer.scene.postProcessStages.getStageByName('skyward-night-readability')?.selected?.some(m=>m.ready&&m.pickIds?.length),{},{timeout:60000});
   const modelUri=await page.evaluate(()=>__viewer.entities.getById('aircraft-abcdef').model.uri.getValue(__viewer.clock.currentTime));
   assert.ok(modelUri.includes(fixture.type==='C172'?'/models/fleet/light-neutral':'/models/sourced/branded/'),'Expected model must load, not a timeout fallback');
   assert.match(await page.title(),/Skyward/);assert.ok(await page.getByRole('region',{name:'Passenger flight view'}).isVisible());
   // Wheel input must adjust distance without releasing tracking or scrolling the page.
   const slider=page.getByRole('slider',{name:'Flight camera distance'});
   await page.waitForTimeout(1800);
   const worldBefore=await page.evaluate(()=>__viewer.entities.getById('aircraft-abcdef').position.getValue(__viewer.clock.currentTime).x);
   const before=Number(await slider.inputValue());await page.mouse.move(1050,480);await page.mouse.wheel(0,-180);
   await page.waitForFunction(value=>Number(document.querySelector('[aria-label="Flight camera distance"]').value)<value,before);
   assert.equal(await page.getByLabel('Flight viewpoint',{exact:true}).inputValue(),'side');
   await slider.fill(await slider.getAttribute('min'));await page.waitForTimeout(1400);
   assert.notEqual(await page.evaluate(()=>__viewer.entities.getById('aircraft-abcdef').position.getValue(__viewer.clock.currentTime).x),worldBefore,'Fixture aircraft must move during zoom');
   assert.ok(await page.evaluate(()=>{const v=__viewer,p=v.entities.getById('aircraft-abcdef').position.getValue(v.clock.currentTime),screen=Cesium.SceneTransforms.worldToWindowCoordinates(v.scene,p);return screen&&screen.x>0&&screen.x<v.canvas.clientWidth&&screen.y>0&&screen.y<v.canvas.clientHeight;}),'Moving aircraft stays in view');
   for(const [lighting,date] of times){
    console.log(`Checking ${fixture.type} ${lighting}`);
    await page.evaluate(d=>{const v=__viewer,C=Cesium;v.clock.clockStep=C.ClockStep.TICK_DEPENDENT;v.clock.currentTime=C.JulianDate.fromIso8601(d);v.clock.shouldAnimate=false;v.scene.requestRender();},date);
    for(const side of ['Left','Right']){
     await page.getByRole('button',{name:side+' side',exact:true}).click();await page.waitForTimeout(1400);
     assert.equal(await slider.inputValue(),await slider.getAttribute('min'));assert.equal(await page.getByLabel('Flight viewpoint',{exact:true}).inputValue(),'side');
     assert.equal(await page.locator('vite-error-overlay,.cesium-widget-errorPanel,.recovery-screen').count(),0);
     await screenshot(page,`${fixture.name}-${lighting}-${side.toLowerCase()}`);results.push({aircraft:fixture.type,lighting,side,zoom:await slider.inputValue()});
    }
   }
   // Dragging empty sky still releases the camera without selecting an aircraft.
   await page.mouse.move(900,250);await page.mouse.down();await page.mouse.move(920,260,{steps:3});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[aria-label="Flight viewpoint"]')?.value==='free');
   await page.getByRole('button',{name:'Resume flight camera',exact:true}).click();
   assert.equal(await page.getByLabel('Flight viewpoint',{exact:true}).inputValue(),'chase');
   await page.getByRole('button',{name:'side',exact:true}).click();
   // Force a pipeline rebuild, the original cause of stale exclusion IDs.
   await page.evaluate(()=>{const s=__viewer.scene.postProcessStages.getStageByName('skyward-night-readability');window.oldSelection=s.selected;window.oldPick=s.selected[0].pickIds[0];const m=s.selected[0];__viewer.entities.getById('aircraft-abcdef').model.customShader=new Cesium.ConstantProperty(new Cesium.CustomShader({fragmentShaderText:m.customShader.fragmentShaderText,uniforms:m.customShader.uniforms}));__viewer.scene.requestRender();});
   await page.waitForFunction(()=>{const s=__viewer.scene.postProcessStages.getStageByName('skyward-night-readability');return s.selected!==oldSelection&&s.selected[0].pickIds[0]!==oldPick;});
   // Mobile resize in both directions must preserve the scene and avoid black bands.
   for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(1600);const shot=await page.screenshot();
    await writeFile(join(artifacts,`${fixture.name}-mobile-${viewport.width}.png`),shot);
    if(viewport.width===390)assert.equal(blackBand(await pixels(page,shot)),false,'Opaque black band in mobile canvas');
    assert.ok(await page.getByRole('region',{name:'Passenger flight view'}).isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   assert.deepEqual(errors,[]);console.log(`PASS ${fixture.type}: day/dusk/night, both sides, max zoom, wheel tracking, mask rebuild, mobile resize`);
  }catch(error){console.error('Browser errors:',errors);await screenshot(page,fixture.name+'-failure');throw error;}finally{await page.close();}
 }
}finally{
 await browser?.close();server.kill();await writeFile(join(artifacts,'server.log'),serverLog);await writeFile(join(artifacts,'results.json'),JSON.stringify(results,null,2));console.log('Browser evidence:',artifacts);
}
