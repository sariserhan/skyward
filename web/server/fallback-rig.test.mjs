import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {fallbackDetailRig,surfaceDeflection,hingedSurface} from '../src/lib/fallbackDetail.ts';
import {nearbyModelIds} from '../src/lib/modelBudget.ts';
import rigs from '../src/lib/fallbackDetailRigs.json' with {type:'json'};
test('fallback rigs partition control surfaces and wheel axles without duplicated geometry',()=>{
 for(const [profile,rig] of Object.entries(rigs)){
  const g=JSON.parse(readFileSync(new URL(`../public/models/fleet/${profile}-neutral-v4.gltf`,import.meta.url)));
  assert.equal(new Set(g.nodes.map(n=>n.name).filter(Boolean)).size,g.nodes.filter(n=>n.name).length);
  const gear=g.nodes.find(n=>n.name==='Gear');assert.equal(gear.children.length,rig.wheels.length);
  for(const wheel of rig.wheels){const index=g.nodes.findIndex(n=>n.name===wheel.name);assert.ok(gear.children.includes(index));assert.ok(wheel.radius>0);}
  const positions=new Set(g.meshes[0].primitives.map(p=>p.attributes.POSITION));
  for(const name of Object.keys(rig.surfaces)){const node=g.nodes.find(n=>n.name===name);assert.ok(node,name);assert.ok(g.meshes[node.mesh].primitives.length<=3,'bounded surface draw calls');for(const p of g.meshes[node.mesh].primitives)assert.ok(!positions.has(p.attributes.POSITION));}
 }
 assert.equal(rigs.b737.wheels.length,3);assert.equal(rigs.b777.wheels.length,7);assert.equal(rigs.b747.wheels.length,9);assert.equal(rigs.a380.wheels.length,11);assert.equal(rigs.a350.wheels.length,5);assert.equal(rigs.a35k.wheels.length,7);
});
test('surface hinges preserve their pivot and keep spoiler deployment on the ground',async()=>{
 const C=await import('cesium');for(const s of Object.values(rigs.b737.surfaces)){
  const tr=hingedSurface(C,s.pivot,s.axis,.3),matrix=C.Matrix4.fromTranslationQuaternionRotationScale(tr.translation,tr.rotation,tr.scale),p=C.Cartesian3.fromArray(s.pivot);
  assert.ok(C.Cartesian3.distance(C.Matrix4.multiplyByPoint(matrix,p,new C.Cartesian3()),p)<1e-10);
 }
 assert.equal(surfaceDeflection('spoiler',1,0,false,150),0);assert.ok(surfaceDeflection('spoiler',1,0,true,100)>0);
 assert.equal(surfaceDeflection('spoiler',1,0,true,0),0);assert.equal(fallbackDetailRig('/models/fleet/ground-b737.gltf'),rigs.b737);
});
test('small distant aircraft remain markers with model hysteresis',()=>{
 const rows=[{id:'tiny',pixels:6,loaded:true},{id:'retain',pixels:8,loaded:true},{id:'wait',pixels:8,loaded:false},{id:'large',pixels:20,loaded:false}].map(a=>({...a,distance:1000,visible:true}));
 assert.deepEqual(nearbyModelIds(rows,8),['retain','large']);
});
test('live fallback animation drives all widebody axles and surfaces without wheel-wrap jumps',async()=>{
 const C=await import('cesium'),{applyAircraftRig}=await import('../src/lib/aircraftRig.ts');globalThis.window={Cesium:C};
 try{const e=new C.Entity({model:{uri:'/models/fleet/b777-THY-v4.gltf'}});applyAircraftRig(e,0,80,1,0,1,90,true);applyAircraftRig(e,1,80,1,.1,1,91,true);
 const values=e.model.nodeTransformations.getValue(C.JulianDate.now());for(const wheel of rigs.b777.wheels)assert.ok(values[wheel.name]);for(const key of Object.keys(rigs.b777.surfaces))assert.ok(values[key]);assert.ok(values.Gear.translation.y>0&&values.Gear.translation.y<.101);
 }finally{delete globalThis.window;}
});
