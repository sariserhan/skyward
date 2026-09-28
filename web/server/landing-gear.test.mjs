import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyAircraftRig,aircraftGearConfiguration} from '../src/lib/aircraftRig.ts';
const anchors=JSON.parse(readFileSync(new URL('../src/lib/aircraftGearAnchors.json',import.meta.url)));
test('sourced gear anchors are measured, finite and cover every sourced airframe',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../src/lib/sourcedAircraft.json',import.meta.url)));
 for(const source of catalog){const gear=anchors[source.id];assert.ok(gear,source.id);assert.ok([...gear.main,...gear.nose,gear.strut,gear.radius].every(Number.isFinite));assert.ok(gear.nose[2]>gear.main[2]);assert.ok(gear.strut>0&&gear.radius>0);}
});
test('sourced aircraft receive gear configuration without replacing their mesh or node transforms',async()=>{
 const C=await import('cesium');globalThis.window={Cesium:C};
 try{const e=new C.Entity({model:{uri:'/watch/models/sourced/b738.gltf'}});applyAircraftRig(e,0,140,1,0,.7,90);assert.equal(aircraftGearConfiguration(e).gear,1);assert.equal(e.model.nodeTransformations,undefined);assert.match(e.model.uri.getValue(C.JulianDate.now()),/sourced\/b738/);applyAircraftRig(e,3,180,0,0,0,90);assert.equal(aircraftGearConfiguration(e).gear,0);}finally{delete globalThis.window;}
});
test('wheel contact heights match sourced airframes; fixed gear and skids are left alone',async()=>{
 const {sourcedGearClearance,sourcedGearAnchors}=await import('../src/lib/landingGear.ts');
 for(const type of ['B738','B38M','B39M','A320','A359','C750','DH8D']){const g=sourcedGearAnchors(type);assert.ok(g,type);assert.ok(Math.abs(sourcedGearClearance(type)+Math.min(g.main[1],g.nose[1])-g.strut-g.radius)<1e-8);}
 for(const type of ['EC35','SR22','C182','AS21'])assert.equal(sourcedGearAnchors(type),undefined);
});
test('moving gear follows the current airframe pose without a frame delay and cleans up',async(t)=>{
 const C=await import('cesium');const {installLandingGear}=await import('../src/lib/landingGear.ts');
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 globalThis.window={Cesium:C};globalThis.document={hidden:false};let seconds=1000;
 t.mock.method(performance,'now',()=>seconds);
 const entities=new C.EntityCollection(),time=C.JulianDate.now(),position=C.Cartesian3.fromDegrees(0,0,10);
 const body=entities.add({id:'aircraft-abcdef',position,orientation:C.Quaternion.IDENTITY,model:{uri:'/watch/models/sourced/b738.gltf'}});
 const event=new C.Event(),viewer={entities,clock:{currentTime:time},camera:{positionWC:C.Cartesian3.add(position,new C.Cartesian3(100,0,0),new C.Cartesian3())},scene:{preRender:event,requestRender(){}},isDestroyed:()=>false};
 const aircraft={hex:'abcdef',aircraftType:'B738',ground:false};let cleanup;
 try{
  applyAircraftRig(body,0,140,1,0,.7,90);cleanup=installLandingGear(C,viewer,()=>({aircraft:[aircraft],selected:aircraft}));event.raiseEvent();
  const wheels=entities.values.filter(e=>e.ellipsoid);assert.equal(wheels.length,6);assert.ok(wheels.every(w=>w.position.isConstant===false));
  const rotation=C.Quaternion.clone(wheels[0].orientation.getValue(time));
  applyAircraftRig(body,1,80,1,0,.7,90,true);seconds+=100;event.raiseEvent();assert.ok(!C.Quaternion.equals(rotation,wheels[0].orientation.getValue(time)));
  assert.equal(entities.values.filter(e=>e.box).length,3);
  const first=wheels[0].position.getValue(time),delta=new C.Cartesian3(20,30,40);
  body.position.setValue(C.Cartesian3.add(position,delta,new C.Cartesian3()));
  const next=wheels[0].position.getValue(time);assert.ok(C.Cartesian3.equalsEpsilon(C.Cartesian3.subtract(next,first,new C.Cartesian3()),delta,0,1e-8));
  entities.remove(body);seconds+=500;event.raiseEvent();assert.equal(entities.values.length,0);
 }finally{cleanup?.();if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
