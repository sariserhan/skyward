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
 assert.equal(predictedLanding(a,160000,{...route,status:'UNVERIFIED'},airport).landingPhase,'approach');
 assert.equal(predictedLanding(a,160000,route,{...airport,elevationFt:undefined}),null);
 assert.equal(predictedLanding(a,160000,route,{...airport,id:'OTHER'}),null);
 assert.equal(predictedLanding(a,110000,route,airport).landingPhase,'approach');
 assert.equal(liveFrame(a,[],160000,true,route,airport).landingPhase,undefined);
});
test('fresh go-around and observed ground reports replace predicted landing; history remains observed',()=>{
 const history=[];const motion=new LiveMotion();assert.equal(motion.sample(a,history,400000,false,route,airport).landingPhase,'stopped');
 const climb={...a,lat:.01,lon:.02,altitude:1800,verticalRate:1800,observedAt:400000};
 assert.equal(motion.sample(climb,history,400000,false,route,airport).landingPhase,undefined);
 const actual=motion.sample(climb,history,408000,false,route,airport),expected=liveFrame(climb,history,408000,false,route,airport);assert.ok(trackDistance(actual,expected)<1e-6);
 const ground={...climb,ground:true,altitude:300,groundSpeed:18,observedAt:409000};const frame=motion.sample(ground,history,409000,false,route,airport);assert.equal(frame.ground,true);assert.equal(frame.estimated,false);const settled=motion.sample(ground,history,417000,false,route,airport),target=liveFrame(ground,history,417000,false,route,airport);assert.ok(trackDistance(settled,target)<1e-6);assert.deepEqual(history,[]);
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

test('tower infers only a descending, closely aligned final when no route is available',()=>{
 const original=structuredClone(a);
 assert.equal(predictedLanding(a,160000,null,airport).landingPhase,'approach');
 assert.equal(predictedLanding(a,700000,null,airport).ground,true);
 for(const patch of [{verticalRate:null},{verticalRate:0},{verticalRate:1000},{heading:115},{lat:.03},{lon:-.2},{altitude:5000}])assert.equal(predictedLanding({...a,...patch},160000,null,airport),null,JSON.stringify(patch));
 assert.deepEqual(a,original);
});
test('approach keeps moving beyond old 30-second cap until touchdown',()=>{
 for(const context of [route,null]){
  let previous=liveFrame(a,[],130000,false,context,airport);
  for(let now=130100;now<170000;now+=100){const next=liveFrame(a,[],now,false,context,airport);assert.equal(next.ground,false);assert.ok(trackDistance(previous,next)>.0001);assert.ok(next.altitude<previous.altitude);previous=next;}
 }
});

test('fresh low fixes past the touchdown marker still land and never reverse to an earlier exit',()=>{
 for(const lon of [.002,.005,.012,.015])for(const altitude of [150,300,420]){
  const plane={...a,lon,altitude,verticalRate:-200};let previous=lon;const phases=new Set();
  for(let second=0;second<=180;second++){
   const frame=predictedLanding(plane,plane.observedAt+second*1000,route,airport);
   assert.ok(frame,`${lon}/${altitude}`);assert.ok(Number.isFinite(frame.lon));
   assert.ok(frame.lon>=previous-1e-8);assert.ok(frame.lon<=.025*.85+1e-8);
   previous=frame.lon;phases.add(frame.landingPhase);
  }
  assert.ok(phases.has('rollout'));assert.ok(phases.has('stopped'));
 }
 assert.equal(predictedLanding({...a,lon:.024,altitude:350},160000,route,airport),null);
});
test('missing route results permit strict final inference but conflicting results do not',()=>{
 const unknown={...route,status:'NOT_FOUND',airports:[]};assert.equal(predictedLanding(a,115000,unknown,airport).landingPhase,'approach');
 for(const patch of [{callsign:'OTHER'},{status:'POSITION_MISMATCH'},{airports:route.airports}])assert.equal(predictedLanding(a,115000,{...unknown,...patch},airport),null);
});
test('continuous observed history can supply missing heading and speed for a mapped landing',()=>{
 const history=[{lat:0,lon:-.09,altitude:2300,time:85000,ground:false},{lat:0,lon:-.08,altitude:2200,time:100000,ground:false}];
 assert.equal(liveFrame({...a,heading:null,groundSpeed:null},history,115000,false,route,airport).landingPhase,'approach');
});
test('successive low airborne fixes cannot restart a rollout; genuine go-arounds still override it',()=>{
 const motion=new LiveMotion(),first={...a,lon:.001,altitude:380};
 motion.sample(first,[],first.observedAt+1000,false,route,airport);
 const rollout=motion.sample(first,[],first.observedAt+20000,false,route,airport);assert.equal(rollout.landingPhase,'rollout');
 const update={...first,lon:rollout.lon,altitude:420,verticalRate:0,observedAt:first.observedAt+20000};
 const next=motion.sample(update,[],update.observedAt,false,route,airport);assert.equal(next.landingPhase,'rollout');assert.equal(next.ground,true);assert.ok(trackDistance(rollout,next)<1e-8);
 const further=motion.sample(update,[],update.observedAt+1000,false,route,airport);assert.equal(further.landingPhase,'rollout');assert.ok(further.lon>next.lon);
 assert.equal(motion.sample({...update,verticalRate:1800,observedAt:update.observedAt+2000},[],update.observedAt+2000,false,route,airport).landingPhase,undefined);
});
test('a retained landing cannot override a conflicting position or destination',()=>{
 for(const mismatch of ['position','destination']){
  const motion=new LiveMotion(),first={...a,lon:.001,altitude:380};motion.sample(first,[],101000,false,route,airport);motion.sample(first,[],120000,false,route,airport);
  const updated={...first,lon:mismatch==='position'?.1:.009,observedAt:120000};
  assert.equal(motion.sample(updated,[],120000,false,mismatch==='destination'?{...route,airports:[route.airports[0],{iata:'OTHER',lat:2,lon:2}]}:route,airport).landingPhase,undefined);
 }
});

test('multi-stop route can land at its aligned intermediate stop and deploy approach gear',async()=>{
 const {AircraftAnimation}=await import('../src/lib/aircraftAnimation.ts');
 const multi={...route,status:'UNVERIFIED',airports:[route.airports[0],route.airports[1],{iata:'CCC',icao:'CCCC',lat:3,lon:3}]};
 const original=structuredClone(multi),motion=new LiveMotion(),animation=new AircraftAnimation(),body={};let previous,phases=new Set();
 for(let seconds=0;seconds<=600;seconds++){
  const frame=motion.sample(a,[],a.observedAt+seconds*1000,false,multi,airport);assert.ok(frame.landingPhase);phases.add(frame.landingPhase);
  assert.equal(animation.sample(body,frame,a.observedAt+seconds*1000).gear,1);
  assert.ok(frame.lon<=.025*.85+1e-8,'Never fly beyond the runway');
  if(previous)assert.ok(trackDistance(previous,frame)<.05);previous=frame;
 }
 assert.deepEqual([...phases],['approach','rollout','stopped']);assert.equal(previous.groundSpeed,0);assert.deepEqual(multi,original);
 for(const patch of [{heading:115},{altitude:5000},{verticalRate:null},{verticalRate:0},{verticalRate:1500},{callsign:'OTHER'}])assert.equal(predictedLanding({...a,...patch},160000,multi,airport),null,JSON.stringify(patch));
 assert.equal(predictedLanding(a,160000,{...multi,status:'POSITION_MISMATCH'},airport),null);
 assert.equal(predictedLanding(a,160000,multi,{...airport,id:'UNLISTED'}),null);
 const fresh={...a,ground:true,groundSpeed:15,heading:180,observedAt:701000},observed=motion.sample(fresh,[],701000,false,multi,airport);assert.equal(observed.ground,true);assert.equal(observed.landingPhase,undefined);assert.equal(observed.estimated,false);assert.equal(observed.time,701000);
});
