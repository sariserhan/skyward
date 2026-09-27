import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyFilters,matchesFilters,filtersActive} from '../src/lib/trafficFilters.ts';
import {towerPose} from '../src/lib/tower.ts';
import {fleetProfile,fleetPaint,fleetUri,observedFrame} from '../src/lib/flightPresentation.ts';
test('shared filters combine airline, family, numeric bounds and supported direction; unknown values stay unknown',()=>{
 const a={callsign:'THY1',aircraftType:'B77W',altitude:32000,groundSpeed:450};
 assert.ok(matchesFilters(a,emptyFilters));assert.ok(!filtersActive(emptyFilters));
 assert.ok(matchesFilters(a,{...emptyFilters,airline:'THY',type:'Boeing',minAltitude:'30000',maxSpeed:'500'}));
 assert.ok(!matchesFilters({...a,altitude:null},{...emptyFilters,minAltitude:'0'}));
 assert.ok(!matchesFilters(a,{...emptyFilters,minSpeed:'500',maxSpeed:'300'}));
 assert.ok(!matchesFilters(a,{...emptyFilters,direction:'Approaching'}));
 assert.ok(matchesFilters(a,{...emptyFilters,direction:'Approaching'},'Approaching'));
 assert.ok(!matchesFilters(a,{...emptyFilters,airline:'UAL'}));
});
test('tower viewpoints are stable on opposite sides and handle the date line',()=>{
 const r={a:[179.99,20],b:[-179.99,20]};const a=towerPose(r,1),b=towerPose(r,-1);
 assert.ok(Math.abs(a.lon)>179&&Math.abs(b.lon)>179);assert.ok(a.lat<20&&b.lat>20);assert.equal(a.height,65);
 assert.ok(Number.isFinite(a.heading));
});
test('variant fleet and added operator logos resolve with valid local geometry and paint materials',()=>{
 for(const [type,profile] of [['B772','b772'],['B788','b788'],['B78X','b78x'],['A35K','a35k'],['PC12','pc12'],['CRJ9','crj'],['E190','e190']]){
  assert.equal(fleetProfile(type),profile);const file=new URL('../public/'+fleetUri({aircraftType:type,callsign:'SIA1'}),import.meta.url),model=JSON.parse(readFileSync(file));
  assert.equal(readFileSync(new URL(model.buffers[0].uri,file)).length,model.buffers[0].byteLength);
  for(const mesh of model.meshes)for(const p of mesh.primitives)assert.ok(p.material<model.materials.length);
 }
 for(const prefix of ['RYR','EZY','WZZ','SIA','CPA','ANA','JAL','QFA','ACA']){assert.equal(fleetPaint(prefix+'1'),prefix);assert.equal(readFileSync(new URL('../public/airlines/'+prefix+'.png',import.meta.url)).subarray(1,4).toString(),'PNG');}
 assert.equal(fleetPaint('ZZZ1'),'neutral');
});
test('nearby animation freezes after last observation and refuses gaps',()=>{
 const a={lon:1,lat:1,altitude:10000,time:1000,ground:false},b={...a,lon:1.05,time:26000};
 assert.ok(observedFrame([a,b],13000).lon>1&&observedFrame([a,b],13000).lon<2);
 assert.equal(observedFrame([a,b],99000).lon,1.05);
 assert.equal(observedFrame([a,{...b,time:130001}],30000).lon,1);
});
