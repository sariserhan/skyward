import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from 'cesium';
import {applyAircraftRig} from '../src/lib/aircraftRig.ts';
import {AircraftAnimation} from '../src/lib/aircraftAnimation.ts';

test('animated rig properties remain stable across frames and reset when the model changes',()=>{
 globalThis.window={Cesium:C};
 try{
  for(const uri of ['/models/fleet/b777-THY-v4.gltf','/models/fleet/b787-THY-v4.gltf','/models/sourced/ec35-v1.gltf']){
   const e=new C.Entity({model:{uri}});applyAircraftRig(e,0,120,1,0,.7,90,true);
   const bag=e.model.nodeTransformations,names=bag.propertyNames,properties=names.map(n=>bag[n]);
   for(let i=1;i<=120;i++)applyAircraftRig(e,i/120,150,0,.1,0,90+i/120,false);
   assert.equal(e.model.nodeTransformations,bag);
   for(let i=0;i<names.length;i++)assert.equal(bag[names[i]],properties[i],names[i]);
   assert.ok(names.length>0);
   e.model.uri=new C.ConstantProperty('/models/fleet/b737-THY-v4.gltf');applyAircraftRig(e,2,150,0,0,0,90,false);
   assert.notEqual(e.model.nodeTransformations,bag);
  }
 }finally{delete globalThis.window;}
});

test('bank angle has the same physical turn response at 30, 60 and 120Hz',()=>{
 const bankAt=hz=>{const animator=new AircraftAnimation(),key={};let pose;
  for(let i=0;i<=hz*3;i++)pose=animator.sample(key,{heading:90+i/hz*2,ground:false,groundSpeed:220,altitude:5000},i/hz*1000);
  return pose.bank;
 };
 assert.ok(bankAt(60)>15);
 assert.ok(Math.abs(bankAt(30)-bankAt(120))<.01);
});
