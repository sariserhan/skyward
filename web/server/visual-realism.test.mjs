import test from 'node:test';import assert from 'node:assert/strict';
import {refineAircraftMaterials} from '../src/lib/aircraftMaterials.ts';
import {cloudImmersion} from '../src/lib/localWeather.ts';
import {wheelMotion} from '../src/lib/wheelMotion.ts';
import {suggestedQuality} from '../src/lib/adaptiveQuality.ts';
import {airportStandDetails} from '../src/lib/airportScenery.ts';
test('surface refinement preserves alpha, texture maps, authored extensions and unknown paint',()=>{
 const model={materials:[{name:'Glass',alphaMode:'BLEND',pbrMetallicRoughness:{baseColorFactor:[1,1,1,.3],roughnessFactor:1}},{name:'rubber',pbrMetallicRoughness:{}},{name:'chrome',pbrMetallicRoughness:{}},{name:'glass',pbrMetallicRoughness:{metallicRoughnessTexture:{index:1}}},{name:'black paint',pbrMetallicRoughness:{roughnessFactor:1}}]};
 assert.equal(refineAircraftMaterials(model),3);assert.equal(model.materials[0].alphaMode,'BLEND');assert.equal(model.materials[0].pbrMetallicRoughness.baseColorFactor[3],.3);assert.equal(model.materials[3].pbrMetallicRoughness.roughnessFactor,undefined);assert.equal(model.materials[4].pbrMetallicRoughness.roughnessFactor,1);assert.equal(refineAircraftMaterials(model),0);
});
test('cloud entry and exit blend continuously rather than switching to opaque haze',()=>{const r={clouds:[{baseM:1000}],storm:false,rain:0,snow:0};assert.equal(cloudImmersion(r,999),0);assert.ok(cloudImmersion(r,1001)<.001);assert.equal(cloudImmersion(r,1300),1);assert.ok(cloudImmersion(r,2169)<.001);assert.equal(cloudImmersion(r,2171),0);});
test('worst stutters are counted when recommending a lower quality',()=>{assert.equal(suggestedQuality('high',Array(90).fill(300)),'balanced');assert.equal(suggestedQuality('high',Array(90).fill(16)),null);});
test('wheels spin up at contact, decay airborne and keep suspension bounded',()=>{
 let s={angle:0,omega:0,compression:0,velocity:0,ground:false,speed:120};
 s=wheelMotion(s,120,true,.5,1,.016);assert.ok(s.omega>0&&s.omega<120*.514444/.5);assert.ok(s.compression>0);
 for(let i=0;i<300;i++){s=wheelMotion(s,Math.max(0,120-i),true,.5,1,.016);assert.ok(s.compression>=0&&s.compression<=.28);}
 const prior=s;s=wheelMotion(s,0,false,.5,1,.016);assert.ok(s.omega<=prior.omega);
 const still=wheelMotion(s,30,true,.5,1,.016,true);assert.equal(still.angle,s.angle);
});
test('decorative bridges require mapped apron and terminal proximity and avoid runways',()=>{
 const ring=[[-.001,-.001],[.001,-.001],[.001,.001],[-.001,.001]];
 const airport={lat:0,lon:0,gates:[{label:'A1',position:[.0013,0]}],surfaces:[{kind:'terminal',points:ring},{kind:'apron',points:[[-.002,-.002],[.003,-.002],[.003,.002],[-.002,.002]]}],runways:[]};
 assert.equal(airportStandDetails(airport).length,1);airport.runways=[{a:[.0011,-.01],b:[.0011,.01],width:45}];assert.equal(airportStandDetails(airport).length,0);airport.runways=[];airport.surfaces.pop();assert.equal(airportStandDetails(airport).length,0);
});
