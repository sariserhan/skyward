import rigs from './fallbackDetailRigs.json' with {type:'json'};
import type * as Cesium from 'cesium';
type Rig={surfaces:Record<string,{kind:string;pivot:number[];axis:number;sign:number}>;wheels:{name:string;radius:number}[]};
export function fallbackDetailRig(uri:string):Rig|undefined{
 const profile=uri.includes('ground-b737')?'b737':uri.match(/\/fleet\/([a-z0-9]+)-/)?.[1];
 return profile?(rigs as Record<string,Rig>)[profile]:undefined;
}
/** Illustrative states only: tracking APIs do not report actual control inputs. */
export function surfaceDeflection(kind:string,flaps:number,steer:number,ground:boolean,speed:number){
 const f=Math.max(0,Math.min(1,flaps));
 if(kind==='flap')return -f*.52;
 if(kind==='slat')return f*.16;
 if(kind==='spoiler')return ground&&speed>45?f*.65:0;
 if(kind==='rudder')return Math.max(-.25,Math.min(.25,steer));
 return ground?0:-f*.07;
}
export function hingedSurface(C:typeof Cesium,pivot:number[],axis:number,angle:number){
 const p=new C.Cartesian3(...pivot),q=C.Quaternion.fromAxisAngle([C.Cartesian3.UNIT_X,C.Cartesian3.UNIT_Y,C.Cartesian3.UNIT_Z][axis],angle);
 const turned=C.Matrix3.multiplyByVector(C.Matrix3.fromQuaternion(q),p,new C.Cartesian3());
 return new C.TranslationRotationScale(C.Cartesian3.subtract(p,turned,new C.Cartesian3()),q);
}
