import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groundPlan,groundFrame,groundHold} from '../src/lib/groundOperations.ts';
import {activityCandidates,nearbyTraffic} from '../src/lib/airportActivity.ts';
import {flightMoment} from '../src/lib/flightMoment.ts';
import {parseRecording} from '../src/lib/sessionRecording.ts';
import {LiveMotion} from '../src/lib/liveMotion.ts';
import {nearbyModelIds} from '../src/lib/modelBudget.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
const runway={id:'09/27',a:[0,0],b:[.025,0],length:2780,width:45};
const airport={id:'TEST',lat:0,lon:.01,elevationFt:300,runways:[runway],paths:[{kind:'taxiway',points:[[.015,0],[.015,.001],[.02,.001]]},{kind:'parking_position',points:[[.02,.001],[.02,.002]]}],gates:[{label:'A1',position:[.02,.002]}]};
const a={hex:'abcdef',callsign:'TEST123',targetKind:'aircraft',lat:38.94,lon:-77.45,altitude:300,heading:90,groundSpeed:12,verticalRate:0,observedAt:100000,ground:true};
test('ground turnarounds retain continuous positions through services, pushback, taxi and departure',()=>{
 const plan=groundPlan(airport);assert.ok(plan);const phases=new Set();let previous;
 for(let t=0;t<=plan.end+1;t+=.05){const f=groundFrame(plan,t);phases.add(f.phase);assert.ok(Number.isFinite(f.heading));if(previous)assert.ok(trackDistance(previous,f)*1852<20,`jump at ${t}`);previous=f;}
 for(const phase of ['taxi in','gate service','pushback','taxi out','takeoff','complete'])assert.ok(phases.has(phase),phase);
 const departure=plan.taxiSeconds+plan.outboundSeconds+48.75,left=groundFrame(plan,departure-.01),right=groundFrame(plan,departure+.01);assert.ok(Math.abs(((right.heading-left.heading+540)%360)-180)<1);
 assert.equal(groundPlan({...airport,paths:[]}),null);
 assert.ok(groundPlan(JSON.parse(readFileSync(new URL('../public/data/airports/IAD.json',import.meta.url)))));
});
test('ground coordination holds for separation and recently occupied runways, ignores stale fixes',()=>{
 const point={lon:.015,lat:0};assert.equal(groundHold(point,[{lon:.0151,lat:0}],airport,[],100000),'Taxi separation');
 const observed={...a,...point,observedAt:90000};assert.match(groundHold(point,[],airport,[observed],100000),/Runway occupied/);assert.equal(groundHold(point,[],airport,[observed],130001),'');assert.equal(groundHold({lon:.02,lat:.002},[],airport,[observed],100000),'');
});
test('airport ground activity and nearby suggestions exclude stale, distant and future data',()=>{
 const rows=[a,{...a,hex:'111111',observedAt:1},{...a,hex:'222222',observedAt:200000},{...a,hex:'333333',lat:0,lon:0}];assert.deepEqual(activityCandidates(rows,new Map(),'IAD',100000,'ground').map(x=>x.aircraft.hex),['abcdef']);assert.deepEqual(nearbyTraffic(rows,a,140000).map(x=>x.aircraft.hex),['abcdef']);assert.equal(activityCandidates(rows,new Map(),'invalid',100000,'ground').length,0);
});
test('flight moments serialize only received fixes and validated camera; retain gap boundaries',()=>{
 const points=[{lon:0,lat:0,altitude:1000,time:100000,ground:false},{lon:.1,lat:0,altitude:1000,time:150000,ground:false,breakBefore:true}];const camera={lon:0,lat:0,height:10000,heading:0,pitch:-1,roll:0};const result=flightMoment(a,points,160000,120,camera),copy=parseRecording(JSON.parse(JSON.stringify(result)));assert.deepEqual(copy.camera,camera);assert.equal(copy.tracks[0].points[1].breakBefore,true);assert.equal(points.length,2);assert.throws(()=>flightMoment(a,points,160000,30,camera),/two received/);assert.throws(()=>parseRecording({...result,camera:{...camera,height:-5}}),/camera/);
});
test('large position corrections blend gradually and preserve source time',()=>{
 const motion=new LiveMotion();const before=motion.sample(a,[],101000);const next={...a,lon:a.lon+.002,heading:180,observedAt:101000};const first=motion.sample(next,[],101000);assert.ok(trackDistance(before,first)<.00001);assert.equal(first.time,next.observedAt);const later=motion.sample(next,[],105000);assert.ok(later.correcting);assert.ok(trackDistance(first,later)>0);const done=motion.sample(next,[],111000);assert.equal(done.correcting,false);
});
test('model budgets retain loaded close models and release offscreen or distant models',()=>{
 const rows=[{id:'loaded',distance:2100,loaded:true,visible:true},{id:'new',distance:2000,loaded:false,visible:true},{id:'offscreen',distance:10,loaded:true,visible:false},{id:'close',distance:200,loaded:false,visible:true}];assert.deepEqual(nearbyModelIds(rows,2),['close','loaded']);assert.deepEqual(nearbyModelIds(rows,0),[]);
});
test('ground rig includes original flap hinges and wheel nodes without modifying community meshes',()=>{
 const model=JSON.parse(readFileSync(new URL('../public/models/fleet/ground-b737.gltf',import.meta.url)));for(const name of ['Gear','WheelN','WheelL','WheelR','FlapL','FlapR'])assert.ok(model.nodes.some(n=>n.name===name));
});
test('supported rigs lower gear gradually and stopped wheels keep their rotation',async()=>{
 const C=await import('cesium');const {applyAircraftRig}=await import('../src/lib/aircraftRig.ts');globalThis.window={Cesium:C};const e=new C.Entity({model:{uri:'fixture.gltf'}}),time=C.JulianDate.now();
 applyAircraftRig(e,0,12,0,0,0,90);applyAircraftRig(e,1,12,1,0,1,100);const first=e.model.nodeTransformations.getValue(time);assert.ok(first.Gear.translation.y>0&&first.Gear.translation.y<3.5);const wheel=C.Quaternion.clone(first.WheelL.rotation);applyAircraftRig(e,2,0,1,0,1,100);const stopped=e.model.nodeTransformations.getValue(time);assert.ok(C.Quaternion.equals(stopped.WheelL.rotation,wheel));assert.ok(stopped.Gear.translation.y<first.Gear.translation.y);delete globalThis.window;
});
