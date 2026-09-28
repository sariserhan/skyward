import test from 'node:test';
import assert from 'node:assert/strict';
import {cockpitCues,cockpitAudioSettings} from '../src/lib/cockpitAudio.ts';
import {rememberSearchRoute,searchRoute,matchesFlightSearch,emptySearch,recentSearches} from '../src/lib/flightSearch.ts';
import {providerRetryAt,nextTrafficAttempt} from '../src/lib/trafficRetry.ts';
import {taxiSpeedProfile,taxiFrame,planTaxi} from '../src/lib/taxiRoute.ts';
import {groundPlan,groundFrame} from '../src/lib/groundOperations.ts';
import {LiveMotion,liveFrame} from '../src/lib/liveMotion.ts';
import {fleetUri} from '../src/lib/flightPresentation.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';

test('route filters distinguish origin from destination and expire stale or mismatched routes',()=>{
 const a={hex:'abcdef',callsign:'THY111',aircraftType:'B738',registration:'TC-TEST'},now=Date.now();
 const r={callsign:a.callsign,status:'PLAUSIBLE',fetchedAt:now,airports:[{iata:'IST',icao:'LTFM',name:'Istanbul Airport',city:'Istanbul'},{iata:'LHR',icao:'EGLL',name:'Heathrow',city:'London'}]};
 assert.equal(matchesFlightSearch(a,{...emptySearch,destination:'London'}),false);
 rememberSearchRoute(a,r);assert.ok(matchesFlightSearch(a,{...emptySearch,origin:'Istanbul',destination:'EGLL',airline:'Turkish'}));
 assert.equal(matchesFlightSearch(a,{...emptySearch,origin:'London'}),false);
 assert.equal(searchRoute(a,now+1800000),null);assert.equal(searchRoute({...a,callsign:'THY222'},now),null);
 rememberSearchRoute(a,{...r,status:'POSITION_MISMATCH'});assert.equal(searchRoute(a,now),null);
 assert.equal(recentSearches([{text:'x',airline:'',type:'',registration:''}])[0].destination,'');
 assert.equal(recentSearches([{...emptySearch,destination:123}]).length,0);
});
test('audio cues avoid joining, reconnect jumps and repeated altitude announcements',()=>{
 const a={agl:110,ground:false,gear:false,at:10000};
 assert.deepEqual(cockpitCues(null,a),[]);
 assert.deepEqual(cockpitCues(a,{...a,agl:90,at:11000}),[100]);
 assert.deepEqual(cockpitCues({...a,agl:90},{...a,agl:80,at:11000}),[]);
 assert.deepEqual(cockpitCues(a,{...a,gear:true,at:11000}),['gear']);
 assert.deepEqual(cockpitCues({...a,agl:20},{...a,agl:0,ground:true,at:11000}),['touchdown']);
 assert.deepEqual(cockpitCues(a,{...a,agl:0,ground:true,at:20000}),[]);
 assert.deepEqual(cockpitCues({...a,agl:600},{...a,agl:40,at:11000}),[]);
 assert.equal(new Set(['C172','AT76','C25C','B738','B77W'].map(t=>cockpitAudioSettings(t,{speed:120,throttle:.5,volume:.3}).frequency)).size,5);
});
test('retry respects delta and HTTP-date cooldowns with bounded exponential outage backoff',()=>{
 const now=Date.UTC(2026,0,1);assert.equal(providerRetryAt('120',now,429),now+120000);
 assert.equal(providerRetryAt(new Date(now+180000).toUTCString(),now,503),now+180000);
 assert.equal(providerRetryAt('invalid',now,429),now+60000);
 assert.equal(nextTrafficAttempt(0,now),now+35000);assert.equal(nextTrafficAttempt(1,now),now+70000);
 assert.equal(nextTrafficAttempt(4,now),now+180000);assert.equal(nextTrafficAttempt(2,now,now+600000),now+600000);
});
const airport={id:'TEST',lat:0,lon:.01,elevationFt:300,runways:[{id:'09/27',a:[0,0],b:[.025,0],length:2780,width:45}],paths:[{kind:'taxiway',points:[[.015,0],[.015,.001],[.02,.001]]},{kind:'parking_position',points:[[.02,.001],[.02,.002]]}],gates:[{label:'A1',position:[.02,.002]}]};
test('taxi slows at bends, obeys acceleration limits and fully reaches the stand before service',()=>{
 const route=planTaxi(airport,{lon:0,lat:0},{lon:.025,lat:0}),profile=taxiSpeedProfile(route);
 assert.ok(profile.speeds.some(v=>v>0&&v<3));assert.ok(profile.speeds.some(v=>v===6));
 let previous=taxiFrame(route,0);for(let t=.1;t<=profile.times.at(-1)+1;t+=.1){const next=taxiFrame(route,t);assert.ok(Math.abs(next.groundSpeed-previous.groundSpeed)*.514444<=.081);previous=next;}
 assert.equal(previous.parked,true);assert.equal(previous.groundSpeed,0);
 const plan=groundPlan(airport),service=groundFrame(plan,plan.taxiSeconds+.01);assert.equal(service.phase,'gate service');assert.equal(service.parked,true);assert.ok(trackDistance(service,{lon:.02,lat:.002})<.0001);
});
test('long-outage position recovery blends for longer without overwriting observations',()=>{
 const a={hex:'outage',callsign:'TEST1',targetKind:'aircraft',lat:0,lon:0,altitude:30000,groundSpeed:400,heading:90,verticalRate:0,observedAt:100000,ground:false};
 const motion=new LiveMotion(),before=motion.sample(a,[],300000),fresh={...a,observedAt:300000,lon:before.lon-.01};
 const first=motion.sample(fresh,[],300000);assert.ok(trackDistance(first,before)<1e-8);
 const during=motion.sample(fresh,[],305000);assert.ok(during.correcting);const end=motion.sample(fresh,[],331000),target=liveFrame(fresh,[],331000);assert.ok(trackDistance(end,target)<1e-8);assert.equal(a.lon,0);
});
test('new full liveries resolve even when the airline has no generic tail overlay',()=>{
 assert.match(fleetUri({aircraftType:'B738',callsign:'ASA123'}),/liveries\/b738-ASA/);
 assert.match(fleetUri({aircraftType:'A320',callsign:'JBU123'}),/liveries\/a320-JBU/);
 assert.match(fleetUri({aircraftType:'A320',callsign:'WZZ123'}),/liveries\/a320-WZZ/);
 assert.doesNotMatch(fleetUri({aircraftType:'B77W',callsign:'ASA123'}),/branded\/.*ASA/);
});
