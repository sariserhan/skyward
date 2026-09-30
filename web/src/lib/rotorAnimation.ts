import jetFans from './jetFanRigs.json' with {type:'json'};
import rigs from './rotorRigs.json' with {type:'json'};
import type * as Cesium from 'cesium';
interface Group {nodes:string[];axis:number;pivot:number[];kind:string;}
interface Rig {groups:Group[];hide:string[];}
export function rotorRig(uri:string):Rig|null {const name=uri.split('/').at(-1)?.split('-')[0]??'';return (rigs as Record<string,Rig>)[uri.includes('/fleet/')?'fleet:'+name:name]??(!uri.includes('/fleet/')?(jetFans as Record<string,Rig>)[name]:null)??null;}
export function rotorRate(kind:string,ground:boolean,speed:number,engineRunning?:boolean){if(engineRunning===false||ground&&speed<.5&&engineRunning!==true)return 0;return (kind==='fan'?18+Math.min(1,Math.max(0,speed)/250)*10:kind==='main'?26:kind==='tail'?80:65)*(ground?.55:1);}
const states=new WeakMap<Cesium.Entity,{time:number;angles:number[];rates:number[];uri:string}>();
/** Animate only explicitly audited nodes around their local hub; RPM is illustrative. */
export function applyRotorRig(entity:Cesium.Entity,uri:string,speed:number,ground:boolean,reduced=false,engineRunning?:boolean){
 const rig=rotorRig(uri);if(!rig||!entity.model)return;const C=window.Cesium,time=performance.now()/1000;
 const prior=states.get(entity),state=prior?.uri===uri?prior:{time,angles:rig.groups.map(()=>0),rates:rig.groups.map(()=>0),uri};
 const dt=Math.max(0,Math.min(.1,time-state.time));state.time=time;states.set(entity,state);
 const transforms:Record<string,Cesium.TranslationRotationScale>={};
 for(const [i,group] of rig.groups.entries()){
  const target=reduced?0:rotorRate(group.kind,ground,speed,engineRunning);state.rates[i]+=(target-state.rates[i])*(1-Math.exp(-dt*(target?2:1.2)));
  if(!reduced)state.angles[i]=(state.angles[i]+dt*state.rates[i])%(Math.PI*2);
  const axis=[C.Cartesian3.UNIT_X,C.Cartesian3.UNIT_Y,C.Cartesian3.UNIT_Z][group.axis],rotation=C.Quaternion.fromAxisAngle(axis,state.angles[i]);
  const pivot=C.Cartesian3.fromArray(group.pivot),turned=C.Matrix3.multiplyByVector(C.Matrix3.fromQuaternion(rotation),pivot,new C.Cartesian3()),translation=C.Cartesian3.subtract(pivot,turned,new C.Cartesian3());
  for(const node of group.nodes)transforms[node]=new C.TranslationRotationScale(translation,rotation);
 }
 for(const node of rig.hide)transforms[node]=new C.TranslationRotationScale(C.Cartesian3.ZERO,C.Quaternion.IDENTITY,C.Cartesian3.ZERO);
 const existing=entity.model.nodeTransformations?.getValue(C.JulianDate.now())??{};entity.model.nodeTransformations=new C.PropertyBag({...existing,...transforms});
}
