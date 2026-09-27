import test from 'node:test';
import assert from 'node:assert/strict';
import { routePath, normalizeRoute } from './routes.mjs';
import { FeedClient } from './feed.mjs';
const raw={callsign:'THY7',airport_codes:'LTFM-KIAD',plausible:true,_airports:[{icao:'LTFM',iata:'IST',name:'Istanbul',location:'Istanbul',lat:41.26,lon:28.7},{icao:'KIAD',iata:'IAD',name:'Dulles',location:'Washington',lat:38.94,lon:-77.45}]};
test('routes preserve endpoint order and lookup time without claiming confirmed plans',()=>{
 const r=normalizeRoute(raw,'THY7',1234);assert.equal(r.airports[0].iata,'IST');assert.equal(r.airports.at(-1).iata,'IAD');assert.equal(r.status,'PLAUSIBLE');assert.equal(r.fetchedAt,1234);
 assert.equal(normalizeRoute({...raw,plausible:false},'THY7',1234).status,'POSITION_MISMATCH');
 assert.equal(normalizeRoute({...raw,plausible:undefined},'THY7',1234).status,'UNVERIFIED');
});
test('unknown routes stay unknown; mismatched callsigns and invalid airport coordinates fail',()=>{
 assert.equal(normalizeRoute({callsign:'THY7',airport_codes:'unknown'},'THY7',1).status,'NOT_FOUND');
 assert.throws(()=>normalizeRoute(raw,'UAL1',1));assert.throws(()=>normalizeRoute(null,'THY7',1));
 assert.throws(()=>normalizeRoute({...raw,_airports:[{...raw._airports[0],lat:100},raw._airports[1]]},'THY7',1));
});
test('route requests validate inputs and preserve valid zero coordinates',()=>{
 assert.equal(routePath(' thy7 ',0,0),'/api/0/route/THY7/0.00/0.00');
 for(const args of [['../bad',0,0],['THY7',NaN,0],['THY7',null,0],['THY7',0,181]])assert.throws(()=>routePath(...args));
});
test('route metadata uses a separate validated cached response, not position normalization',async()=>{
 let calls=0;const client=new FeedClient(async url=>{calls++;assert.match(url,/api\/0\/route\/THY7/);return {ok:true,json:async()=>raw};});
 const [a,b]=await Promise.all([client.route('THY7',39,-70),client.route('THY7',39,-70)]);
 assert.equal(calls,1);assert.equal(a.status,'PLAUSIBLE');assert.equal(a.fetchedAt,b.fetchedAt);
 assert.equal((await client.route('THY7',39,-70)).fetchedAt,a.fetchedAt);assert.equal(calls,1);
});
test('route failures cannot return a successful empty itinerary',async()=>{
 const client=new FeedClient(async()=>({ok:false,status:503}));await assert.rejects(client.route('THY7',39,-70));
});
test('official standing-data fallback stays unverified and backs off the failed plausibility service',async()=>{
 const urls=[];const client=new FeedClient(async url=>{urls.push(url);return url.includes('vrs-standing-data')?{ok:true,json:async()=>raw}:{ok:false,status:500};});
 const first=await client.route('THY7',39,-70);assert.equal(first.status,'UNVERIFIED');
 const second=await client.route('THY7',39,-70);assert.equal(second.fetchedAt,first.fetchedAt);assert.equal(urls.length,2);
});
test('multi-leg and return routes retain every stop instead of guessing the active leg',()=>{
 const route=normalizeRoute({...raw,_airports:[...raw._airports,raw._airports[0]]},'THY7',100);
 assert.deepEqual(route.airports.map(a=>a.icao),['LTFM','KIAD','LTFM']);
 assert.equal(route.activeLeg,undefined);
});
