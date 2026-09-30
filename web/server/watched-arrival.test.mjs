import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {LiveMotion} from '../src/lib/liveMotion.ts';
import {AircraftAnimation} from '../src/lib/aircraftAnimation.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
import {landingRouteMode} from '../src/lib/landingRoute.ts';
const airport=JSON.parse(readFileSync(new URL('../public/data/airports/NRT.json',import.meta.url))),elevations=JSON.parse(readFileSync(new URL('../data/airport-elevations.json',import.meta.url)));airport.elevationFt=elevations.NRT;
// Actual captured KAL2129 observation, 2026-09-29; subsequent feed updates below are adversarial fixtures.
const a={callsign:'KAL2129',hex:'71c711',aircraftType:'A21N',targetKind:'aircraft',ground:false,lat:35.711711,lon:140.445596,altitude:1825,groundSpeed:153.8,heading:329.1,verticalRate:-768,observedAt:1790647744044};
const route={callsign:a.callsign,status:'UNVERIFIED',airports:[{iata:'PUS',icao:'RKPK',lat:35.179501,lon:128.938004},{iata:'NRT',icao:'RJAA',lat:35.764702,lon:140.386002}]};
test('captured Narita final completes watched gear, landing, fallback taxi and parking despite late contradictory fixes',()=>{
 const motion=new LiveMotion(),stop=motion.watch(a.hex),animation=new AircraftAnimation(),body={},phases=new Set(),original=structuredClone(a);let previous,end,gearBeforeTouchdown=false;
 for(let second=0;second<=900;second++){
  const now=a.observedAt+second*1000;
  const input=second>30?{...a,lat:a.lat+(second%2?.03:-.02),altitude:second%2?4000:125,ground:second%3===0,observedAt:now-60000}:a;
  const frame=motion.sample(input,[],now,false,route,airport);assert.ok(frame.arrivalAnimation);phases.add(frame.landingPhase);const gear=animation.sample(body,frame,now).gear;assert.equal(gear,frame.gear);if(!frame.ground&&gear===1)gearBeforeTouchdown=true;if(frame.ground)assert.ok(gearBeforeTouchdown);
  if(previous){assert.ok(trackDistance(previous,frame)<.05);assert.ok(Math.abs(frame.altitude-previous.altitude)<35,`Vertical drop at ${second}`);if(previous.ground)assert.equal(frame.ground,true);}
  previous=frame;end=frame;
 }
 assert.ok(phases.has('approach'));assert.ok(phases.has('rollout'));assert.ok(phases.has('taxi'));assert.ok(phases.has('parked'));assert.equal(end.groundSpeed,0);assert.match(end.gate,/illustrative stand/);assert.deepEqual(a,original);
 stop();assert.equal(motion.sample(a,[],a.observedAt+901000,false,route,airport).arrivalAnimation,undefined);
});
test('arrival ownership is opt-in, releasable, and never applied to another aircraft',()=>{
 const m=new LiveMotion();assert.equal(m.sample(a,[],a.observedAt,false,route,airport).arrivalAnimation,undefined);m.watch(a.hex);assert.equal(m.sample(a,[],a.observedAt,false,route,airport).arrivalAnimation,true);
 assert.equal(m.sample({...a,hex:'other'},[],a.observedAt,false,route,airport).arrivalAnimation,undefined);m.stopArrival(a.hex);assert.equal(m.sample(a,[],a.observedAt+1000,false,route,airport).arrivalAnimation,undefined);
 assert.equal(landingRouteMode(a.callsign,route,{id:'PUS',lat:35.179501,lon:128.938004}),null);
});
test('late airborne overshoot joins a continuous circuit rather than snapping backward',()=>{
 const m=new LiveMotion();const late=a.observedAt+160000,old=m.sample(a,[],late,false,null,null);m.watch(a.hex);
 let previous=m.sample(a,[],late,false,route,airport);assert.ok(trackDistance(old,previous)<1e-8);let parked=false;
 for(let t=late+1000;t<late+1800000;t+=1000){const f=m.sample(a,[],t,false,route,airport);assert.ok(trackDistance(previous,f)<.06);if(!f.ground)assert.ok(Math.abs(((f.heading-previous.heading+540)%360)-180)<4);previous=f;if(f.landingPhase==='parked'){parked=true;break;}}
 assert.ok(parked,'Rejoin must converge to landing and parking');
});
test('large vertical feed corrections do not collapse into a two-second drop',()=>{
 const m=new LiveMotion(),first={...a,altitude:8000,verticalRate:0};m.sample(first,[],a.observedAt);const update={...first,altitude:6000,observedAt:a.observedAt+1000};let previous=m.sample(update,[],update.observedAt);
 for(let t=update.observedAt+100;t<update.observedAt+90000;t+=100){const f=m.sample(update,[],t);assert.ok(Math.abs(f.altitude-previous.altitude)<4);previous=f;}assert.ok(previous.altitude<=6001);
});
test('watched base-leg arrivals intercept the runway smoothly before landing',()=>{
 const m=new LiveMotion(),plane={...a,heading:240,altitude:2500};m.watch(plane.hex);let previous,parked=false;
 for(let second=0;second<1800;second++){const f=m.sample(plane,[],plane.observedAt+second*1000,false,route,airport);assert.equal(f.arrivalAnimation,true);if(previous){assert.ok(trackDistance(previous,f)<.06);assert.ok(Math.abs(f.altitude-previous.altitude)<40);}previous=f;if(f.landingPhase==='parked'){parked=true;break;}}
 assert.ok(parked);
});

test('watched rejoin does not inherit extended gear during its approach circuit',()=>{
 const m=new LiveMotion(),late=a.observedAt+160000;m.sample(a,[],late,false,null,null);m.watch(a.hex);
 let rejoined=false,landed=false;
 for(let t=late;t<late+1800000;t+=1000){
  const frame=m.sample(a,[],t,false,route,airport);
  if(frame.arrivalRejoin){rejoined=true;assert.equal(frame.gear,0);}
  if(frame.ground){assert.equal(frame.gear,1);landed=true;break;}
 }
 assert.ok(rejoined);assert.ok(landed);
});
