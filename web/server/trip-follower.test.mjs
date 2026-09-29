import test from 'node:test';
import assert from 'node:assert/strict';
import {tripQuery,tripRegions,createTripDiscovery,tripResponse} from './trip-follower.mjs';
import {currentTripAircraft,tripGroup,savedTripRoutes} from '../src/lib/tripFollower.ts';
const now=Date.parse('2026-09-29T12:00:00Z'),q={from:'IST',to:'IAD',date:'2026-09-29'};
const aircraft={hex:'abcdef',callsign:'THY7',lat:38.95,lon:-77.46,ground:false,verticalRate:-800,observedAt:now,altitude:5000,targetKind:'aircraft'};
const match={callsign:'THY7',status:'PLAUSIBLE',airports:[{iata:'IST'},{iata:'IAD'}]};
const finish=async s=>{for(let i=0;i<100&&s.loading;i++)await new Promise(r=>setImmediate(r));assert.equal(s.loading,false);};
test('trip queries validate dates and airports; corridor covers endpoints and wraps safely',()=>{
 assert.deepEqual(tripQuery(new URLSearchParams(q)),q);
 for(const change of [{to:'IST'},{from:'ZZZ'},{date:'2026-02-30'}])assert.throws(()=>tripQuery(new URLSearchParams({...q,...change})));
 const regions=tripRegions(q);assert.equal(regions.length,5);assert.ok(regions.every(r=>Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180&&r.radius<=250));
 assert.equal(savedTripRoutes([q,{...q,to:'ZZZ'},null]).length,1);
});
test('free discovery verifies exact directional route, deduplicates, caches, and never invokes paid services',async()=>{
 let areas=0,routes=0;
 const feed={cameraArea:async()=>{areas++;return {aircraft:[aircraft,aircraft,{...aircraft,hex:'bbbbbb',callsign:'OTHER'}]};},route:async code=>{routes++;return code==='THY7'?match:{...match,callsign:code,airports:match.airports.toReversed()};}};
 const discover=createTripDiscovery(feed,{now:()=>now}),s=discover(q);assert.equal(discover(q),s);await finish(s);
 assert.equal(areas,5);assert.equal(routes,2);assert.equal(s.flights.length,1);assert.equal(s.flights[0].callsign,'THY7');assert.equal(s.partial,true);assert.equal(discover(q),s);
 assert.equal(discover({...q,date:'2026-09-28'}).flights.length,0);assert.equal(areas,5);
});
test('discovery excludes stale fixes and unverified routes and limits route checks',async()=>{
 let calls=0;const rows=Array.from({length:30},(_,i)=>({...aircraft,hex:i.toString(16).padStart(6,'0'),callsign:'T'+i}));rows.push({...aircraft,hex:'stale',observedAt:now-121000});
 const s=createTripDiscovery({cameraArea:async()=>({aircraft:rows}),route:async code=>{calls++;return {...match,callsign:code,status:'UNVERIFIED'};}},{now:()=>now})(q);await finish(s);assert.equal(calls,12);assert.equal(s.flights.length,0);
});
test('ground phases depend on actual airport proximity; stale and sample positions cannot be followed',()=>{
 const f={...q,id:'f',callsign:'THY7',status:'unknown',hex:'abcdef'};
 assert.equal(tripGroup(f,aircraft),'Approaching');assert.equal(tripGroup(f,{...aircraft,ground:true}),'Landed');
 assert.equal(tripGroup(f,{...aircraft,ground:true,lat:0,lon:0}),'Unknown');assert.equal(currentTripAircraft(f,[{...aircraft,observedAt:now-121000}],now),null);
 assert.equal(currentTripAircraft({...f,sample:true},[aircraft],now),null);assert.equal(currentTripAircraft({...f,hex:'bbbbbb'},[aircraft],now),null);
});
test('sample flights remain unmistakably synthetic with no aircraft identities',async()=>{
 const r=await tripResponse(new URLSearchParams({...q,sample:'1'}),now);assert.equal(r.mode,'demo');assert.ok(r.flights.every(f=>f.sample&&f.hex===null&&f.callsign.startsWith('DEMO')));
});
test('partial failures finish with explicit coverage and allow later searches',async()=>{
 const s=createTripDiscovery({cameraArea:async()=>{throw Error('offline');},route:async()=>{throw Error('must not call');}},{now:()=>now})(q);await finish(s);assert.equal(s.errors,5);assert.equal(s.flights.length,0);assert.match(s.message,/unavailable/);
});
