import test from 'node:test';
import assert from 'node:assert/strict';
import {airlineNames} from '../src/lib/airlineNames.ts';
import {publicPage} from './public-pages.mjs';
import {handle} from '../cloudflare/router.mjs';
import {fetchAirLabsAirlineSchedules} from './airlabs.mjs';
import {createPremiumLive} from './premium-live.mjs';
import {verifiedAirLabs} from './fixtures/airlabs-permissions.mjs';
const origin='https://skyvvard.com',env={SKYWARD_PUBLIC_ORIGIN:origin},page=path=>publicPage(new URL(path,origin),env);
test('airline directory and canonical airline boards serve for every recognized operator',async()=>{
 const directory=page('/airlines/');assert.equal(directory.status,200);assert.match(directory.body,/Turkish Airlines/);
 for(const code of Object.keys(airlineNames)){assert.ok(directory.body.includes(`/airlines/${code}/`));const p=page(`/airlines/${code}/`);assert.equal(p.status,200);assert.ok(p.body.includes(`data-airline="${code}"`));assert.match(p.body,/noindex,follow/);assert.doesNotMatch(p.body,/special-flights.js/);}
 assert.equal(page('/airlines/thy').location,'/airlines/THY/');assert.equal(page('/airlines/ZZZ/').status,404);assert.match(page('/sitemap.xml').body,/<loc>https:\/\/skyvvard.com\/airlines\/<\/loc>/);
 assert.match(page('/airlines/THY/').body,/Ticket prefix: <strong>TK/);
 for(const method of ['GET','HEAD']){const r=await handle(new Request(origin+'/airlines/THY/',{method}),env);assert.equal(r.status,200);if(method==='HEAD')assert.equal(await r.text(),'');}
});
test('airline schedule requests reject other operators and preserve optional aircraft data',async()=>{
 const good={airline_icao:'THY',flight_icao:'THY7',flight_iata:'TK7',dep_iata:'IST',arr_iata:'IAD',dep_time_ts:1790910000,aircraft_icao:'B789',reg_number:'TC-TEST',status:'active'};
 let calls=0;const result=await fetchAirLabsAirlineSchedules({apiKey:'fixture',airline:'THY',fetchImpl:async url=>{calls++;assert.equal(url.searchParams.get('airline_icao'),'THY');assert.equal(url.searchParams.get('limit'),'50');return Response.json({response:[good,{...good,airline_icao:'UAL'},{...good,flight_icao:'UAL7'},{...good,flight_icao:'THY9',aircraft_icao:null,reg_number:null}]});}});
 assert.equal(calls,1);assert.equal(result.flights.length,2);assert.equal(result.flights[0].aircraftType,'B789');assert.equal(result.flights[0].registration,'TC-TEST');assert.equal(result.flights[1].aircraftType,null);assert.equal(result.horizonHours,10);assert.equal(result.partial,true);
 await assert.rejects(fetchAirLabsAirlineSchedules({apiKey:'fixture',airline:'XXX',fetchImpl:()=>{throw Error('should not call');}}),/supported airline/);
});
test('airline checks share a cache and pending request, enforce entitlement and charge once',async()=>{
 let paid=true,spent=0,calls=0,release;
 const service=createPremiumLive({env:{SKYWARD_AIRLABS_MODE:'live',SKYWARD_BILLING_MODE:'live',AIRLABS_API_KEY:'fixture'},permissions:verifiedAirLabs,paid:async()=>paid,reserve:async()=>{spent++;},fetchImpl:async()=>{calls++;await new Promise(resolve=>{release=resolve;});return Response.json({response:[]});}});
 const a=service.airlineSchedules({id:'a'},'THY'),b=service.airlineSchedules({id:'b'},'THY');await new Promise(r=>setImmediate(r));release();await Promise.all([a,b]);
 assert.equal(calls,1);assert.equal(spent,1);assert.equal((await service.airlineSchedules({id:'c'},'THY')).cached,true);
 paid=false;await assert.rejects(service.airlineSchedules({id:'free'},'THY'),/paid subscription/);assert.equal(calls,1);
 await assert.rejects(service.airlineSchedules({id:'a'},'XXX'),/supported airline/);assert.equal(spent,1);
 const disabled=createPremiumLive({env:{},paid:async()=>true,reserve:async()=>{throw Error('should not charge');}});await assert.rejects(disabled.airlineSchedules({},'THY'),/not enabled/);
});
