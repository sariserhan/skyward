import {fallbackDetailRig,hingedSurface,surfaceDeflection} from './fallbackDetail.ts';
import {applyRotorRig} from './rotorAnimation.ts';
import type * as Cesium from 'cesium';
const states=new WeakMap<Cesium.Entity,{time:number;angle:number;heading:number;steer:number;gear:number;flaps:number;load:number}>();
const configurations=new WeakMap<Cesium.Entity,{gear:number;speed:number;ground:boolean;heading?:number}>();
export const aircraftGearConfiguration=(entity:Cesium.Entity)=>configurations.get(entity);
/** Animate known fallback nodes; sourced airframes use an independent gear overlay. */
export function applyAircraftRig(entity:Cesium.Entity,seconds:number,speed:number,gear:number,steering:number,flaps:number,heading?:number,ground=false,reduced=false,engineRunning?:boolean){
 if(!entity.model)return;
 configurations.set(entity,{gear,speed,ground,heading});
 const uri=String(entity.model.uri?.getValue(window.Cesium.JulianDate.now())??'');const quiet=reduced||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 if(!uri.includes('/models/fleet/')){if(/\/a3(?:19|20)(?:-[A-Z0-9]+)?-v1\.gltf/.test(uri)){const C=window.Cesium;entity.model.nodeTransformations??=new C.PropertyBag();for(const name of ['EngineL','EngineR']){const transform=new C.TranslationRotationScale(new C.Cartesian3(quiet||engineRunning===false?0:Math.sin(seconds*24+(name==='EngineL'?0:1))*.0015,0,0));if(entity.model.nodeTransformations.hasProperty(name))entity.model.nodeTransformations[name]=new C.ConstantProperty(transform);else entity.model.nodeTransformations.addProperty(name,transform);}}applyRotorRig(entity,uri,speed,ground,quiet,engineRunning);return;}
 const old=states.get(entity)??{time:seconds,angle:0,heading:heading??0,steer:0,gear,flaps,load:0},dt=Math.max(0,Math.min(2,seconds-old.time));old.angle=old.angle+dt*Math.max(0,speed)*.514444/.4;if(heading!==undefined&&dt>0&&speed>1)steering=Math.max(-.5,Math.min(.5,(((heading-old.heading+540)%360)-180)/dt*.04));old.steer+=(steering-old.steer)*(1-Math.exp(-dt*6));old.gear+=Math.max(-dt*.4,Math.min(dt*.4,gear-old.gear));old.flaps+=Math.max(-dt*.3,Math.min(dt*.3,flaps-old.flaps));old.heading=heading??old.heading;old.time=seconds;states.set(entity,old);const C=window.Cesium,g=Math.max(0,Math.min(1,old.gear)),roll=C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_X,old.angle),steer=C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_Y,Math.max(-.5,Math.min(.5,old.steer))),nose=C.Quaternion.multiply(steer,roll,new C.Quaternion()),flap=C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_X,-Math.max(0,Math.min(1,old.flaps))*.6);
 entity.model.nodeTransformations=new C.PropertyBag({Gear:new C.TranslationRotationScale(new C.Cartesian3(0,(1-g)*3.5,0),C.Quaternion.IDENTITY,new C.Cartesian3(g<=.001?0:1,g<=.001?0:1,g<=.001?0:1)),WheelN:new C.TranslationRotationScale(C.Cartesian3.ZERO,nose),WheelL:new C.TranslationRotationScale(C.Cartesian3.ZERO,roll),WheelR:new C.TranslationRotationScale(C.Cartesian3.ZERO,roll),FlapL:new C.TranslationRotationScale(C.Cartesian3.ZERO,flap),FlapR:new C.TranslationRotationScale(C.Cartesian3.ZERO,flap)});
 const detail=fallbackDetailRig(uri);
 if(detail){
  const bag=entity.model.nodeTransformations;
  const put=(name:string,value:Cesium.TranslationRotationScale)=>{if(bag.hasProperty(name))bag[name]=new C.ConstantProperty(value);else bag.addProperty(name,value);};
  for(const [name,surface] of Object.entries(detail.surfaces))put(name,hingedSurface(C,surface.pivot,surface.axis,surfaceDeflection(surface.kind,old.flaps,old.steer,ground,speed)*surface.sign));
  for(const wheel of detail.wheels){const q=C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_X,old.angle*.4/wheel.radius);put(wheel.name,new C.TranslationRotationScale(C.Cartesian3.ZERO,wheel.name==='WheelN'?C.Quaternion.multiply(steer,q,new C.Quaternion()):q));}
  // Smooth loading compression; no periodic bouncing while parked.
  old.load+=((ground?.10:0)-old.load)*(1-Math.exp(-dt*4));const compression=old.load*g;
  const gearTransform=bag.Gear.getValue(C.JulianDate.now());gearTransform.translation.y+=compression;put('Gear',gearTransform);
 }
 if(/\/b787-[^/]+-v4\.gltf/.test(uri)){
  const flex=quiet?0:(ground?.002:.014+Math.min(600,Math.max(0,speed))*.000012)+(!ground&&!quiet?Math.sin(seconds*1.6)*.0015:0);
  for(const [name,sign] of [['FlexWingL',-1],['FlexWingR',1]] as const)entity.model.nodeTransformations.addProperty(name,new C.TranslationRotationScale(C.Cartesian3.ZERO,C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_Z,flex*sign)));
 }
 applyRotorRig(entity,uri,speed,ground,quiet,engineRunning);
}
