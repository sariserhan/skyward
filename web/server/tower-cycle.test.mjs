import test from 'node:test';
import assert from 'node:assert/strict';
import {groundPlan} from '../src/lib/groundOperations.ts';
import {towerCycle} from '../src/lib/towerCycle.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
const runway={id:'09/27',a:[0,0],b:[.025,0],length:2780,width:45};
const airport={id:'TEST',lat:0,lon:.01,runways:[runway],paths:[{kind:'taxiway',points:[[.015,0],[.015,.001],[.02,.001]]},{kind:'parking_position',points:[[.02,.001],[.02,.002]]}],gates:[{label:'A1',position:[.02,.002]}]};
test('tower show lands, rolls out, taxis, services, pushes back and takes off without position jumps',()=>{const p=groundPlan(airport),phases=new Set();let before;for(let t=0;t<p.end+48;t+=.05){const f=towerCycle(p,t);phases.add(f.phase);assert.ok(Number.isFinite(f.altitude));if(before)assert.ok(trackDistance(before,f)*1852<20,`jump at ${t}`);before=f;}for(const phase of ['landing','rollout','taxi in','gate service','pushback','taxi out','takeoff','complete'])assert.ok(phases.has(phase),phase);assert.ok(towerCycle(p,0).altitude>0);assert.equal(towerCycle(p,45).altitude,0);assert.ok(trackDistance(towerCycle(p,44.999),towerCycle(p,45.001))<.00001);});

test('runway-only landing and takeoff do not require taxiways or stands',async()=>{
 const {runwayDemonstration,usableDemoRunway}=await import('../src/lib/towerCycle.ts');
 const runway={id:'09/27',a:[0,0],b:[.03,0],length:3300,width:45};
 assert.equal(usableDemoRunway(runway),true);assert.equal(usableDemoRunway(undefined),false);assert.equal(usableDemoRunway({...runway,b:[0,0]}),false);assert.equal(usableDemoRunway({...runway,a:[NaN,0]}),false);
 for(const mode of ['landing','takeoff']){let previous=runwayDemonstration(runway,mode,0);for(let t=.1;t<=45;t+=.1){const frame=runwayDemonstration(runway,mode,t);assert.ok([frame.lat,frame.lon,frame.altitude,frame.heading].every(Number.isFinite));assert.ok(Math.abs(frame.lon-previous.lon)<.001);assert.ok(frame.altitude>=0);assert.equal(frame.gate,undefined);previous=frame;}assert.equal(runwayDemonstration(runway,mode,45).phase,'complete');}
 assert.equal(runwayDemonstration(runway,'landing',45).altitude,0);assert.ok(runwayDemonstration(runway,'takeoff',45).altitude>0);
});
