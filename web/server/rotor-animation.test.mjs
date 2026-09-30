import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {rotorRig,rotorRate,applyRotorRig} from '../src/lib/rotorAnimation.ts';
import rigs from '../src/lib/rotorRigs.json' with {type:'json'};
test('audited moving nodes exist and never include helicopter fuselages',()=>{for(const [id,rig] of Object.entries(rigs)){const p=id.startsWith('fleet:')?`fleet/${id.slice(6)}-neutral-v4.gltf`:`sourced/${id}-v1.gltf`,g=JSON.parse(readFileSync(new URL('../public/models/'+p,import.meta.url)));const names=new Set(g.nodes.map(n=>n.name));for(const name of [...rig.groups.flatMap(g=>g.nodes),...rig.hide]){assert.ok(names.has(name),id+': '+name);assert.ok(!/fuselage|^tailrotor$/i.test(name));}}assert.equal(rotorRig('/watch/models/sourced/branded/ec35-neutral-v1.gltf').groups[0].kind,'main');assert.equal(rotorRig('/watch/models/sourced/b738-v1.gltf').groups[0].kind,'fan');});
test('props and rotors turn in flight and hover, stop parked, and respect a known engine state',()=>{assert.ok(rotorRate('main',false,0)>0);assert.ok(rotorRate('propeller',false,120)>0);assert.equal(rotorRate('tail',true,0),0);assert.ok(rotorRate('propeller',true,0,true)>0);assert.equal(rotorRate('propeller',false,120,false),0);});
test('node transforms preserve each hub and keep fuselage and existing gear untouched',async()=>{const C=await import('cesium');globalThis.window={Cesium:C};try{const uri='/watch/models/sourced/ec35-v1.gltf',e=new C.Entity({model:{uri}});applyRotorRig(e,uri,90,false);await new Promise(r=>setTimeout(r,30));applyRotorRig(e,uri,90,false);const nodes=e.model.nodeTransformations.getValue(C.JulianDate.now()),g=rigs.ec35.groups[0],t=nodes[g.nodes[0]],p=C.Cartesian3.fromArray(g.pivot);const turned=C.Cartesian3.add(C.Matrix3.multiplyByVector(C.Matrix3.fromQuaternion(t.rotation),p,new C.Cartesian3()),t.translation,new C.Cartesian3());assert.ok(C.Cartesian3.equalsEpsilon(p,turned,1e-9));assert.ok(!C.Quaternion.equals(t.rotation,C.Quaternion.IDENTITY));assert.equal(nodes.fuselage,undefined);applyRotorRig(e,uri,90,false,true);const quiet=e.model.nodeTransformations.getValue(C.JulianDate.now());assert.ok(C.Quaternion.equals(t.rotation,quiet[g.nodes[0]].rotation));}finally{delete globalThis.window;}});
test('split fallback blades have complete triangles and valid shared index buffers for every livery',async()=>{
 const {readdirSync}=await import('node:fs');const base=new URL('../public/models/fleet/',import.meta.url);
 for(const file of readdirSync(base).filter(n=>/^(turboprop|light|pc12)-.*-(v4|v1)\.gltf$/.test(n))){
  const g=JSON.parse(readFileSync(new URL(file,base))),props=g.nodes.filter(n=>n.name?.startsWith('SkywardProp'));
  if(!props.length)continue;
  assert.equal(props.length,file.startsWith('turboprop')?2:1);
  for(const node of props)for(const p of g.meshes[node.mesh].primitives){const acc=g.accessors[p.indices],view=g.bufferViews[acc.bufferView],buffer=g.buffers[view.buffer],bytes=readFileSync(new URL(buffer.uri,base));assert.equal(bytes.length,buffer.byteLength);assert.equal(acc.count,file.startsWith('turboprop')?144:36);for(let i=0;i<acc.count;i++)assert.ok(bytes.readUInt32LE((view.byteOffset??0)+i*4)<g.accessors[p.attributes.POSITION].count);}
 }
});

test('jet fans use explicit circular meshes, preserve hubs and never rotate engine casings',async()=>{
 const fans=JSON.parse(readFileSync(new URL('../src/lib/jetFanRigs.json',import.meta.url)));const C=await import('cesium');globalThis.window={Cesium:C};
 try{for(const [id,rig] of Object.entries(fans)){
 const g=JSON.parse(readFileSync(new URL(`../public/models/sourced/${id}-v1.gltf`,import.meta.url)));const names=new Set(g.nodes.map(n=>n.name));
 for(const group of rig.groups){assert.ok(group.nodes.every(n=>names.has(n)));assert.ok(group.nodes.every(n=>!/casing|cowl|fuselage|^engine[lr]?$/i.test(n)));assert.equal(group.kind,'fan');assert.ok(group.pivot.every(Number.isFinite));}
 assert.ok(rig.hide.every(n=>names.has(n)));
 const uri=`/watch/models/sourced/branded/${id}-THY-v1.gltf?tail=2`,entity=new C.Entity({model:{uri}});entity.model.nodeTransformations=new C.PropertyBag({Gear:new C.TranslationRotationScale()});applyRotorRig(entity,uri,250,false);await new Promise(r=>setTimeout(r,2));applyRotorRig(entity,uri,250,false);const transforms=entity.model.nodeTransformations.getValue(C.JulianDate.now());assert.ok(transforms.Gear);
 for(const group of rig.groups){const t=transforms[group.nodes[0]],p=C.Cartesian3.fromArray(group.pivot),q=C.Cartesian3.add(C.Matrix3.multiplyByVector(C.Matrix3.fromQuaternion(t.rotation),p,new C.Cartesian3()),t.translation,new C.Cartesian3());assert.ok(C.Cartesian3.equalsEpsilon(p,q,1e-9));assert.ok(!C.Quaternion.equals(t.rotation,C.Quaternion.IDENTITY));}
 }assert.equal(rotorRate('fan',false,250,false),0);assert.ok(rotorRate('fan',true,0,true)>0);assert.ok(rotorRate('fan',false,250)>rotorRate('fan',true,10));}finally{delete globalThis.window;}
});
