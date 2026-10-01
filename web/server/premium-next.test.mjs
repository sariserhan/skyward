import {verifiedAirLabs} from './fixtures/airlabs-permissions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPremiumLive} from './premium-live.mjs';
import {normalizeFlight,fetchAirLabsSchedules} from './airlabs.mjs';
import {aviationFeed,createPremiumHome} from './premium-home.mjs';
import {sqlitePremiumStore} from './premium-store.mjs';
import {parseJourneyCalendar,journeyCalendar} from '../src/lib/journeyCalendar.ts';
import {replayInterval,replayCamera} from '../src/lib/replayEdit.ts';
const now=Date.UTC(2026,8,30,12),row={flight_icao:'AAL6',hex:'abcdef',dep_time_ts:now/1000,dep_iata:'IAD',arr_iata:'JFK',status:'landed',dep_actual_ts:now/1000+60};
test('Dated status accepts landed aircraft without a fresh position, rejects other dates and identities',()=>{
 const expected={callsign:'AAL6',date:'2026-09-30'};const r=normalizeFlight({response:row},expected,now);assert.equal(r.status,'MATCHED_DATED_FLIGHT');assert.equal(r.flight.departure.actualAt,now+60000);
 for(const changes of [{dep_time_ts:now/1000-86400},{flight_icao:'AAL7'},{dep_time_ts:null}])assert.equal(normalizeFlight({response:{...row,...changes}},expected,now).flight,null);
 assert.equal(normalizeFlight({response:row},{...expected,hex:'123456'},now).flight,null);assert.equal(normalizeFlight({response:row},{...expected,to:'LHR'},now).status,'ROUTE_MISMATCH');
});
test('Live requests require explicit configuration and independently verified payment before budget or network',async()=>{
 let calls=0,reservations=0;const deps={permissions:verifiedAirLabs,env:{},paid:async()=>true,reserve:async()=>reservations++,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({response:row})};},now:()=>now},j={callsign:'AAL6',hex:'',date:'2026-09-30'};
 await assert.rejects(createPremiumLive(deps).flight({},j),e=>e.status===503);
 const env={SKYWARD_BILLING_MODE:'live',SKYWARD_AIRLABS_MODE:'live',AIRLABS_API_KEY:'secret'};
 await assert.rejects(createPremiumLive({...deps,env,paid:async()=>false}).flight({},j),e=>e.status===403);
 assert.equal(calls,0);assert.equal(reservations,0);
 let paid=true;const service=createPremiumLive({...deps,env,paid:async()=>paid});
 const results=await Promise.all([service.flight({id:'a'},j),service.flight({id:'b'},j)]);assert.equal(calls,1);assert.equal(reservations,1);assert.equal(results[0].status,'MATCHED_DATED_FLIGHT');assert.equal((await service.flight({},j)).cached,true);
 paid=false;await assert.rejects(service.flight({},j),e=>e.status===403);assert.equal(calls,1);
 assert.ok(!JSON.stringify(results).includes('secret'));
});
test('Budget rejection never calls provider; provider failure has no retry or refund',async()=>{
 const env={SKYWARD_BILLING_MODE:'live',SKYWARD_AIRLABS_MODE:'live',AIRLABS_API_KEY:'secret'};let calls=0,reserved=0;
 const deps={permissions:verifiedAirLabs,env,paid:async()=>true,reserve:async()=>{throw Error('budget');},fetchImpl:async()=>{calls++;throw Error('secret');}},j={callsign:'AAL6',date:'2026-09-30'};
 await assert.rejects(createPremiumLive(deps).flight({},j),/budget/);assert.equal(calls,0);
 await assert.rejects(createPremiumLive({...deps,reserve:async()=>reserved++}).flight({},j),/No automatic retry/);assert.equal(calls,1);assert.equal(reserved,1);
});
test('Schedules make one bounded request, filter other airports and redact provider payload',async()=>{
 let calls=0;const data=await fetchAirLabsSchedules({apiKey:'secret',airport:'IAD',direction:'departures',now,fetchImpl:async(url,options)=>{calls++;assert.equal(url.searchParams.get('limit'),'50');assert.equal(url.searchParams.get('dep_iata'),'IAD');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({response:[row,{...row,dep_iata:'LHR'}],request:{api_key:'secret'}})};}});assert.equal(calls,1);assert.equal(data.flights.length,1);assert.equal(data.partial,true);assert.ok(!JSON.stringify(data).includes('secret'));
});
test('Calendar import/export round-trips dates, unfolds lines and flags local timezone ambiguity',()=>{
 const j={callsign:'THY111',date:'2026-09-30',from:'IST',to:'IAD'};assert.deepEqual(parseJourneyCalendar(journeyCalendar(j,now))[0],{...j,summary:'THY111 · IST → IAD',warning:undefined});
 const local='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Europe/Istanbul:20260930T003000\r\nSUMMARY:THY\r\n 111 IST -> IAD\r\nEND:VEVENT\r\nEND:VCALENDAR';const r=parseJourneyCalendar(local)[0];assert.equal(r.callsign,'THY111');assert.match(r.warning,/UTC/);assert.equal(r.date,'2026-09-30');
 assert.throws(()=>parseJourneyCalendar('x'.repeat(300000)),/256 KB/);assert.throws(()=>parseJourneyCalendar('not a calendar'),/iCalendar/);
 assert.equal(parseJourneyCalendar(local.replace('20260930','20260230')).length,0);
});
test('Personalized feed excludes stale and simulated aircraft; home preferences remain bounded and private',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const store=sqlitePremiumStore(db),a={hex:'abcdef',callsign:'AAL6',aircraftType:'B738',lat:38.96,lon:-77.45,targetKind:'aircraft',observedAt:now},prefs={airports:['IAD'],types:['B789']};
 assert.equal(aviationFeed([a,{...a,hex:'123456',simulation:{}},{...a,hex:'111111',observedAt:now-180000}],prefs,now).length,1);
 const home=createPremiumHome({store,listJourneys:async()=>[],observations:()=>[a],now:()=>now});await home('/api/premium/preferences','POST',{id:'a'},{...prefs,intent:'explore'});
 const data=await home('/api/premium/home','GET',{id:'a'},{});assert.equal(data.feed.length,1);assert.equal(data.usage.resetAt,Date.UTC(2026,9,1));assert.equal((await home('/api/premium/home','GET',{id:'b'},{})).preferences.onboarded,false);
 await assert.rejects(home('/api/premium/preferences','POST',{id:'a'},{...prefs,intent:'explore',airports:['FAKE']}),e=>e.status===400);
});
test('Replay interval validation prevents out-of-recording clips and sequences switch predictably',()=>{
 const r={tracks:[{points:[{time:1000},{time:61000}]}]};assert.deepEqual(replayInterval(r,5,20),{start:6000,end:21000});for(const [a,b]of [[-1,3],[0,61],[10,10],[NaN,5]])assert.throws(()=>replayInterval(r,a,b));assert.equal(replayCamera(.49,'side-bird'),'side');assert.equal(replayCamera(.5,'side-bird'),'bird');assert.equal(replayCamera(.7,'bird-side'),'side');
});
