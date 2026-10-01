import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpecialFlights} from './special-flights.mjs';
import {registrationBatchPath} from './feed.mjs';
import {publicPage} from './public-pages.mjs';
import {observatoryRoute} from '../src/lib/pageRoutes.ts';
import {handle} from '../cloudflare/router.mjs';
const origin='https://skyvvard.com',now=Date.parse('2026-10-01T12:00:00Z');
const aircraft={hex:'abcdef',registration:'9M-XXD',callsign:'XAX123',aircraftType:'A333',ground:false,observedAt:now,lat:3,lon:101,altitude:33000,groundSpeed:460,heading:90,verticalRate:0,sourceType:'adsb'};
test('worldwide scan covers the whole featured catalog in one batch and coalesces visitors',async()=>{
 let calls=0,regs=[],clock=now;
 const scan=createSpecialFlights({registrations:async values=>{calls++;regs=values;return {aircraft:[aircraft,{...aircraft,hex:'aaaaaa',registration:'OH-LKE'}]};}},{now:()=>clock});
 const [a,b]=await Promise.all([scan(),scan()]);
 assert.equal(calls,1);assert.equal(regs.length,120);assert.ok(regs.includes('9M-XXD'));assert.ok(!regs.includes('OH-LKE'));
 assert.equal(a.rows.length,1);assert.equal(a.rows[0].path,'/ufc/9m-xxd/');assert.equal(b.rows[0].aircraft.observedAt,now);
 clock+=59000;await scan();assert.equal(calls,1);
 clock+=2000;await scan();assert.equal(calls,2);
 clock=now+121000;assert.equal((await scan()).rows.length,0);
});
test('failures remain unavailable and do not produce alerts or trigger a request storm',async()=>{
 let calls=0;const scan=createSpecialFlights({registrations:async()=>{calls++;throw Error('provider');}},{now:()=>now});
 const a=await scan();assert.equal(a.state,'unavailable');assert.equal(a.rows.length,0);assert.equal(a.checkedAircraft,0);
 await scan();assert.equal(calls,1);
});
test('worldwide alerts reject grounded, simulated, stale and ambiguous aircraft',async()=>{
 for(const rows of [[{...aircraft,ground:true}],[{...aircraft,simulation:{}}],[{...aircraft,observedAt:now-121000}],[aircraft,{...aircraft,hex:'aaaaaa'}]]){
  const result=await createSpecialFlights({registrations:async()=>({aircraft:rows})},{now:()=>now})();assert.equal(result.rows.length,0);
 }
});
test('batch paths are bounded, normalized and cannot accept arbitrary provider queries',()=>{
 assert.equal(registrationBatchPath(['N36NE','9M-XXD','N36NE']),'/v2/reg/9M-XXD,N36NE');
 for(const rows of [[],Array(151).fill('N36NE'),['N36NE&all'],['N36NE,N225NE'],['../mil'],null])assert.throws(()=>registrationBatchPath(rows));
});
test('organization/registration links are catalog-bound, canonical and interactive in both servers',async()=>{
 const route=observatoryRoute('/ufc/9m-xxd/');assert.equal(route.registration,'9M-XXD');assert.equal(route.collection,'UFC');
 assert.equal(observatoryRoute('/ufc/N36NE'),null);assert.equal(observatoryRoute('/fake/9m-xxd'),null);
 const page=publicPage(new URL('/ufc/9m-xxd/',origin),{SKYWARD_PUBLIC_ORIGIN:origin});assert.equal(page.observatory,true);assert.match(page.body,/noindex,follow/);
 assert.equal(publicPage(new URL('/UFC/9M-XXD',origin),{}).location,'/ufc/9m-xxd/');
 const env={SKYWARD_PUBLIC_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('<head><script type="module" src="/watch/assets/main.js"></script></head>')}};
 const response=await handle(new Request(origin+'/ufc/9m-xxd/'),env);assert.equal(response.status,200);assert.match(await response.text(),/special-flights.js/);
 assert.equal((await handle(new Request(origin+'/ufc/not-a-reg/'),env)).status,404);
});
test('Cloudflare shares a canonical cache key without forwarding viewer credentials',async()=>{
 let calls=0,received;const items=new Map(),original=globalThis.caches;
 globalThis.caches={default:{match:async r=>items.get(r.url)?.clone(),put:async(r,response)=>items.set(r.url,response)}};
 try{
  const env={COORDINATOR:{idFromName:()=>1,get:()=>({fetch:async req=>{calls++;received=req;return Response.json({state:'ready',rows:[]});}})}};
  await handle(new Request(origin+'/api/special-flights?airport=IAD',{headers:{Cookie:'private=secret'}}),env);
  const r=await handle(new Request(origin+'/api/special-flights?airport=IST'),env);
  assert.equal(calls,1);assert.equal(received.url,origin+'/api/special-flights');assert.equal(received.headers.get('cookie'),null);assert.match(r.headers.get('cache-control'),/max-age=30/);
  assert.equal((await handle(new Request(origin+'/api/special-flights',{method:'POST'}),env)).status,405);
 }finally{globalThis.caches=original;}
});
