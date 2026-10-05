import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/airport-catalog.json' with {type:'json'};
import {publicPage} from './public-pages.mjs';
import {handle} from '../cloudflare/router.mjs';
import {createPremiumLive} from './premium-live.mjs';
import {verifiedAirLabs} from './fixtures/airlabs-permissions.mjs';
import {fetchAirLabsSchedules,scheduleAirportCode} from './airlabs.mjs';
const env={SKYWARD_PUBLIC_ORIGIN:'https://skyvvard.com'},page=path=>publicPage(new URL(path,env.SKYWARD_PUBLIC_ORIGIN),env);
test('all catalog airports have canonical board pages with useful links and unavailable state',()=>{
 for(const id of Object.keys(catalog)){const p=page(`/airports/${id}/board/`);assert.equal(p.status,200,id);assert.ok(p.body.includes(`data-airport="${id}"`));assert.match(p.body,/airport-board.js/);assert.doesNotMatch(p.body,/special-flights.js|type="module".*main-/);}
 assert.equal(page('/airports/iad/board').location,'/airports/IAD/board/');assert.equal(page('/airports/NOTREAL/board/').status,404);
 assert.match(page('/airports/IAD/board/').body,/America\/New_York/);assert.match(page('/airports/IAD/').body,/\/airports\/IAD\/board\//);
 // Public board pages are indexable; live schedule access is still authenticated.
 assert.doesNotMatch(page('/airports/IAD/board/').body,/noindex/);assert.doesNotMatch(page('/sitemap.xml').body,/\/board\//);
});
test('edge boards serve without loading the globe or calling the flight provider',async()=>{
 for(const method of ['GET','HEAD']){const r=await handle(new Request(env.SKYWARD_PUBLIC_ORIGIN+'/airports/IAD/board/',{method}),env);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');const html=await r.text();if(method==='HEAD')assert.equal(html,'');else assert.match(html,/Airport flight board/);}
});
test('schedule normalization preserves dates, missing gates, and correct airport direction',async()=>{
 const stamp=1790884800;
 const rows=[{flight_icao:'UAL10',flight_iata:'UA10',dep_iata:'IAD',arr_iata:'LHR',dep_time_ts:stamp,dep_estimated_ts:stamp+600,dep_terminal:'1',dep_gate:'C12',status:'scheduled'},{flight_icao:'BAW20',dep_iata:'IAD',arr_iata:'JFK',dep_time_ts:stamp+3600},{flight_icao:'DAL30',dep_iata:'ATL',arr_iata:'IAD',dep_gate:'A1'}];
 const result=await fetchAirLabsSchedules({apiKey:'test-only',airport:'IAD',direction:'departures',fetchImpl:async url=>{assert.equal(url.searchParams.get('dep_iata'),'IAD');return {ok:true,json:async()=>({response:rows})};}});
 assert.equal(result.flights.length,2);assert.equal(result.flights[0].departure.gate,'C12');assert.equal(result.flights[0].departure.scheduledAt,stamp*1000);assert.equal(result.flights[1].departure.gate,null);assert.ok(result.flights[0].arrival.name.includes('Heathrow'));assert.equal(result.partial,true);
});

test('unsupported airport identifiers never consume a schedule allowance',async()=>{
 assert.equal(scheduleAirportCode('CA-1291'),null);assert.deepEqual(scheduleAirportCode('KIAD'),{code:'KIAD',kind:'icao'});
 let spent=0,calls=0;const service=createPremiumLive({env:{SKYWARD_AIRLABS_MODE:'live',SKYWARD_BILLING_MODE:'live',AIRLABS_API_KEY:'fixture'},permissions:verifiedAirLabs,paid:async()=>true,reserve:async()=>{spent++;},fetchImpl:async()=>{calls++;return Response.json({response:[]});}});
 await assert.rejects(service.schedules({id:'fixture'},'CA-1291','departures'),/unavailable for this airport/);assert.equal(spent,0);assert.equal(calls,0);
});
