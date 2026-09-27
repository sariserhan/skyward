import test from 'node:test';
import assert from 'node:assert/strict';
import {predictedLanding} from '../src/lib/landingPrediction.ts';
import {liveFrame,LiveMotion,liveMotionStatus} from '../src/lib/liveMotion.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
const airport={id:'TEST',lat:0,lon:.01,elevationFt:300,runways:[{id:'09/27',a:[0,0],b:[.025,0],length:2780,width:45}]};
const route={status:'PLAUSIBLE',callsign:'THY9WR',airports:[{iata:'AAA',lat:2,lon:1},{iata:'TEST',icao:'TEST',lat:0,lon:.01}]};
const a={hex:'abcdef',callsign:'THY9WR',targetKind:'aircraft',lat:0,lon:-.08,altitude:2200,heading:90,groundSpeed:160,verticalRate:-700,observedAt:100000,ground:false};
test('aligned approach descends, flares, rolls out and stops inside a mapped runway without changing observations',()=>{
 const original=structuredClone(a);let altitude=Infinity,lon=-Infinity,seen=new Set();
 for(let seconds=15;seconds<=600;seconds++){
  const frame=predictedLanding(a,a.observedAt+seconds*1000,route,airport);assert.ok(frame);seen.add(frame.landingPhase);
  assert.ok(frame.altitude<=altitude+1e-8);assert.ok(frame.lon>=lon-1e-8);assert.ok(frame.lon<=.025*.85+1e-8);assert.ok(frame.altitude>=300);assert.equal(frame.time,a.observedAt);assert.equal(frame.estimated,true);
  if(frame.ground)assert.equal(frame.altitude,300);altitude=frame.altitude;lon=frame.lon;
 }
 assert.deepEqual([...seen],['approach','rollout','stopped']);assert.deepEqual(a,original);
 const end=liveFrame(a,[],700000,false,route,airport);assert.equal(end.groundSpeed,0);assert.equal(end.landingPhase,'stopped');assert.match(liveMotionStatus(a,[],700000,false,route,airport),/Predicted landing/);
});
test('landing trajectory is continuous across touchdown and rollout completion',()=>{
 let previous=predictedLanding(a,115000,route,airport);
 for(let now=115100;now<350000;now+=100){const next=predictedLanding(a,now,route,airport);assert.ok(trackDistance(previous,next)<.005);assert.ok(Math.abs(next.altitude-previous.altitude)<5);previous=next;}
});
test('unrelated airports, wrong headings, climbs, high overflights and incomplete data never trigger a landing',()=>{
 for(const patch of [{heading:270},{verticalRate:1200},{altitude:30000},{ground:true},{heading:null},{groundSpeed:null},{groundSpeed:400},{positionWarning:'Suspect fix'},{targetKind:'vehicle'},{callsign:'OTHER'},{lon:.05}])assert.equal(predictedLanding({...a,...patch},160000,route,airport),null,JSON.stringify(patch));
 assert.equal(predictedLanding(a,160000,{...route,status:'UNVERIFIED'},airport),null);
 assert.equal(predictedLanding(a,160000,route,{...airport,elevationFt:undefined}),null);
 assert.equal(predictedLanding(a,160000,route,{...airport,id:'OTHER'}),null);
 assert.equal(predictedLanding(a,110000,route,airport),null);
 assert.equal(liveFrame(a,[],160000,true,route,airport).landingPhase,undefined);
});
test('fresh go-around and observed ground reports replace predicted landing; history remains observed',()=>{
 const history=[];const motion=new LiveMotion();assert.equal(motion.sample(a,history,400000,false,route,airport).landingPhase,'stopped');
 const climb={...a,lat:.01,lon:.02,altitude:1800,verticalRate:1800,observedAt:400000};
 assert.equal(motion.sample(climb,history,400000,false,route,airport).landingPhase,undefined);
 const actual=motion.sample(climb,history,402000,false,route,airport),expected=liveFrame(climb,history,402000,false,route,airport);assert.ok(trackDistance(actual,expected)<1e-6);
 const ground={...climb,ground:true,altitude:300,groundSpeed:18,observedAt:403000};const frame=motion.sample(ground,history,403000,false,route,airport);assert.equal(frame.ground,true);assert.equal(frame.estimated,false);assert.equal(frame.lon,ground.lon);assert.deepEqual(history,[]);
});
test('animated approach speed matches the decelerating readout through touchdown',()=>{
 for(const patch of [{},{lat:.006,heading:100}]){
  const plane={...a,...patch};let checked=0;
  for(let seconds=20;seconds<180;seconds+=.5){
   const first=predictedLanding(plane,a.observedAt+seconds*1000,route,airport),next=predictedLanding(plane,a.observedAt+(seconds+.1)*1000,route,airport);
   if(!first||!next||first.landingPhase!=='approach'||next.landingPhase!=='approach')continue;
   const animatedSpeed=trackDistance(first,next)*36000;
   assert.ok(Math.abs(animatedSpeed-first.groundSpeed)<2,`${animatedSpeed} vs ${first.groundSpeed}`);checked++;
  }
  assert.ok(checked>100);
 }
});
