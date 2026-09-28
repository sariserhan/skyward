import test from 'node:test';
import assert from 'node:assert/strict';
import {planTaxi,taxiFrame} from '../src/lib/taxiRoute.ts';
import {predictedLanding} from '../src/lib/landingPrediction.ts';
import {LiveMotion,liveFrame} from '../src/lib/liveMotion.ts';
import {runwayFrame} from '../src/lib/flightPresentation.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
const runway={id:'09/27',a:[0,0],b:[.025,0],length:2780,width:45};
const airport={id:'TEST',lat:0,lon:.01,elevationFt:300,runways:[runway],paths:[{kind:'taxiway',points:[[.015,0],[.015,.001],[.02,.001]]},{kind:'parking_position',points:[[.02,.001],[.02,.002]]}],gates:[{label:'A1',position:[.02,.002]}]};
const route={status:'PLAUSIBLE',callsign:'TEST123',airports:[{iata:'AAA',lat:2,lon:1},{iata:'TEST',lat:0,lon:.01}]};
const aircraft={hex:'abcdef',callsign:'TEST123',targetKind:'aircraft',lat:0,lon:-.08,altitude:2200,heading:90,groundSpeed:160,verticalRate:-700,observedAt:100000,ground:false};
test('landing continues off the runway over connected taxiways and parks at an illustrative stand',()=>{
 const source=structuredClone(aircraft),phases=new Set();let previous=null,last;
 for(let seconds=15;seconds<=1200;seconds+=.25){last=predictedLanding(aircraft,100000+seconds*1000,route,airport);assert.ok(last);phases.add(last.landingPhase);if(previous)assert.ok(trackDistance(previous,last)<.02);previous=last;}
 assert.deepEqual([...phases],['approach','rollout','taxi','parked']);assert.equal(last.gate,'A1');assert.equal(last.groundSpeed,0);assert.ok(Math.abs(last.lat-.002)<1e-6);assert.deepEqual(aircraft,source);
});
test('taxi planner refuses absent and disconnected stand geometry; parking speed is continuous',()=>{
 const start={lon:0,lat:0},end={lon:.025,lat:0};
 assert.equal(planTaxi({...airport,paths:[]},start,end),null);
 assert.equal(planTaxi({...airport,paths:[airport.paths[0],{kind:'parking_position',points:[[.021,.001],[.021,.002]]}]},start,end),null);
 const taxi=planTaxi(airport,start,end);assert.ok(taxi);let prior=taxiFrame(taxi,0);
 for(let t=.1;t<300;t+=.1){const next=taxiFrame(taxi,t);assert.ok(trackDistance(prior,next)<.001);assert.ok(next.groundSpeed<=12);prior=next;}
 assert.equal(prior.parked,true);
});
test('ground updates blend smoothly, stationary aircraft stay parked, and stale taxi estimates are bounded',()=>{
 const a={...aircraft,lat:0,lon:0,ground:true,groundSpeed:12,altitude:0,observedAt:100000};const motion=new LiveMotion();const first=motion.sample(a,[],101000);assert.ok(first.lon>0);
 const next={...a,lon:.0002,observedAt:101000};const corrected=motion.sample(next,[],101000);assert.ok(Math.abs(corrected.lon-first.lon)<1e-8);assert.equal(corrected.correcting,true);
 assert.ok(Math.abs(motion.sample(next,[],103100).lon-liveFrame(next,[],103100).lon)<1e-8);
 assert.equal(liveFrame(a,[],109000).lon,liveFrame(a,[],200000).lon);
 assert.equal(liveFrame({...a,groundSpeed:0},[],102000).lon,a.lon);assert.equal(liveFrame(a,[],102000,true).lon,a.lon);
});
test('takeoff and landing demos avoid a speed discontinuity at liftoff/touchdown',()=>{
 for(const [kind,t] of [['takeoff',.55],['landing',.5]]){const h=.00001,a=runwayFrame(runway,kind,t-h),b=runwayFrame(runway,kind,t),c=runwayFrame(runway,kind,t+h);const before=trackDistance(a,b),after=trackDistance(b,c);assert.ok(Math.abs(before-after)/Math.max(before,after)<.001);assert.ok(Math.abs(c.altitude-b.altitude)<1);}
});

test('a low observed climb rises gradually, and high-speed ground prediction requires a mapped aligned runway',()=>{
 const a={...aircraft,lon:.002,lat:0,altitude:300,verticalRate:900};const climb=liveFrame(a,[],102000);assert.ok(climb.altitude>300&&climb.altitude<340);
 const ground={...a,ground:true,groundSpeed:100};assert.equal(liveFrame(ground,[],102000).lon,ground.lon);
 assert.ok(liveFrame(ground,[],102000,false,null,airport).lon>ground.lon);
 assert.equal(liveFrame({...ground,lat:.1},[],102000,false,null,airport).lon,ground.lon);
});

test('incomplete globe surface samples cannot put tower traffic kilometers underground',async()=>{
 const {surfaceHeight}=await import('../src/lib/surfaceHeight.ts');
 for(const value of [undefined,NaN,Infinity,-10421,10000])assert.equal(surfaceHeight(value),0);
 for(const value of [0,-430,89,8849])assert.equal(surfaceHeight(value),value);
});
test('a late touchdown cannot taxi backward to an exit already passed',()=>{
 const plane={...aircraft,lon:.016,altitude:330,verticalRate:-200};let previous=plane.lon;
 for(let seconds=0;seconds<200;seconds++){
  const frame=predictedLanding(plane,100000+seconds*1000,route,airport);assert.ok(frame);assert.ok(frame.lon>=previous-1e-8);assert.notEqual(frame.landingPhase,'taxi');previous=frame.lon;
 }
});
