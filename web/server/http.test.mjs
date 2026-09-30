import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server } from './index.mjs';
let base;
before(async()=>{ await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); base=`http://127.0.0.1:${server.address().port}`; });
after(async()=>{ await new Promise(resolve=>server.close(resolve)); });
test('health check is explicit about not measuring upstream availability', async()=>{
  const r=await fetch(`${base}/healthz`); assert.equal(r.status,200);
  assert.equal((await r.json()).upstream,'not checked');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');
});
test('entry HTML revalidates; HEAD has no body; unsupported methods are rejected',async()=>{
  const r=await fetch(`${base}/watch/`,{method:'HEAD'});assert.equal(r.status,200);
  assert.equal(await r.text(),'');assert.equal(r.headers.get('cache-control'),'no-store');
  const denied=await fetch(`${base}/api/aircraft`,{method:'POST'});assert.equal(denied.status,405);
});
test('invalid inputs fail locally and cannot be forwarded to the upstream feed',async()=>{
  for(const path of ['/api/area?lat=&lon=29&radius=100','/api/area?lat=41&lon=29&radius=251','/api/area?lat=999&lon=29&radius=100','/api/aircraft?airport=UNKNOWN','/api/route?callsign=THY7&lat=&lon=0','/api/search?kind=hex&q=invalid']) {
    const r=await fetch(base+path);assert.equal(r.status,400);
  }
  assert.equal((await fetch(`${base}/watch/%2e%2e%2fpackage.json`)).status,403);
});
test('feed health returns aggregate counters without making an upstream request',async()=>{
 const r=await fetch(`${base}/api/status`);assert.equal(r.status,200);const body=await r.json();
 assert.equal(body.started,0);assert.equal(body.lastPositionAt,null);assert.equal(body.pending,0);assert.equal(body.meanProviderMs,0);
});
test('rate limiting sends a retry interval without issuing upstream requests',async()=>{
  let r;
  for(let i=0;i<65;i++)r=await fetch(`${base}/api/unknown`);
  assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);
});

// Node fetch transparently decompresses; the decoded body must equal identity delivery.
test('large startup assets negotiate gzip, respect q=0 and preserve HEAD metadata',async()=>{
 const path='/watch/cesium/Cesium.js';
 const packed=await fetch(base+path,{headers:{'Accept-Encoding':'gzip'}});
 assert.equal(packed.headers.get('content-encoding'),'gzip');assert.equal(packed.headers.get('vary'),'Accept-Encoding');
 const decoded=await packed.text();
 const plain=await fetch(base+path,{headers:{'Accept-Encoding':'gzip;q=0, identity'}});
 assert.equal(plain.headers.get('content-encoding'),null);assert.equal(await plain.text(),decoded);
 assert.ok(Number(packed.headers.get('content-length'))<Number(plain.headers.get('content-length'))*.5);
 const head=await fetch(base+path,{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});
 assert.equal(head.headers.get('content-length'),packed.headers.get('content-length'));assert.equal(await head.text(),'');
});

test('homepage serves Skyward, legacy watch redirects, and the game has its own asset directory',async()=>{
 const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/Skyward · 3D Flight Tracker/);
 for(const path of ['/watch','/watch/','/watch/index.html']){const r=await fetch(base+path+'?test=1',{redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/?test=1');}
 const redirect=await fetch(base+'/airport-simulation?test=1',{redirect:'manual'});assert.equal(redirect.headers.get('location'),'/airport-simulation/?test=1');
 const game=await fetch(base+'/airport-simulation/');assert.equal(game.status,401);assert.match(await game.text(),/included with Premium/);
 for(const file of ['index.js','index.wasm','index.pck']){const r=await fetch(base+'/airport-simulation/'+file,{method:'HEAD'});assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);}
 assert.equal((await fetch(base+'/index.wasm')).status,404);assert.equal((await fetch(base+'/airport-simulation/%2e%2e%2fpackage.json')).status,401);
 const sw=await fetch(base+'/offline-worker.js');assert.equal(sw.status,200);assert.match(sw.headers.get('content-type'),/javascript/);
 const manifest=await (await fetch(base+'/watch/manifest.json')).json();assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
});
