import type * as Cesium from 'cesium';
import type {Aircraft} from '../types';
import anchors from './aircraftLightAnchors.json' with {type:'json'};
import {sourcedModel,fleetProfile} from './flightPresentation.ts';
type Anchor={length:number;left:number[];right:number[];tail:number[];beacon:number[]};
export function aircraftLightPulse(seconds:number,phase=0,reduced=false){
 const t=((seconds+phase)%1.2+1.2)%1.2;
 return {strobe:!reduced&&(t<.065||(t>=.15&&t<.215)),beacon:!reduced&&t>=.5&&t<.66};
}
/** glTF +Z nose / +Y up becomes Cesium +X nose / +Z up. +Y is aircraft left. */
export function lightAnchorToBody(p:number[]){return [p[2],p[0],p[1]];}
export function installAircraftLights(C:typeof Cesium,v:Cesium.Viewer,getState:()=>{aircraft:Aircraft[];selected:Aircraft|null;reduced:boolean;tower?:boolean}){
 const collection=v.scene.primitives.add(new C.PointPrimitiveCollection());
 type Entry={entity:Cesium.Entity;anchor:Anchor;points:Cesium.PointPrimitive[];phase:number};
 const entries=new Map<string,Entry>();let discovery=0;
 const colors=[C.Color.fromCssColorString('#ff3930'),C.Color.fromCssColorString('#55ff8a'),C.Color.WHITE,C.Color.WHITE,C.Color.WHITE,C.Color.fromCssColorString('#ff3026')];
 const update=()=>{
  if(v.isDestroyed()||document.hidden)return;
  const state=getState(),time=v.clock.currentTime,now=performance.now();
  if(now-discovery>500){
   discovery=now;const aircraft=new Map([...state.aircraft,...(state.selected?[state.selected]:[])].map(a=>[a.hex,a]));const keep=new Set<string>();
   const candidates=v.entities.values.filter(e=>e.show&&e.model&&(e.id.startsWith('aircraft-')||e.id==='flight-simulation')).sort((a,b)=>Number(b.id.endsWith(state.selected?.hex??'!'))-Number(a.id.endsWith(state.selected?.hex??'!')));
   for(const entity of candidates){
    if(keep.size>=12)break;
    const a=entity.id==='flight-simulation'?state.selected:aircraft.get(entity.id.slice(9));if(!a||a.targetKind!=='aircraft')continue;
    const position=entity.position?.getValue(time);if(!position)continue;
    const uri=String(entity.model!.uri?.getValue(time)??''),source=uri.includes('/models/fleet/')?null:sourcedModel(a.aircraftType);
    const anchor=(anchors as Record<string,Anchor>)[source?.id??('fallback:'+fleetProfile(a.aircraftType))];if(!anchor)continue;
    if(C.Cartesian3.distance(position,v.camera.positionWC)>(state.tower?20000:Math.min(1800,anchor.length*10)))continue;
    keep.add(entity.id);const old=entries.get(entity.id);if(old){old.anchor=anchor;continue;}
    const points=colors.map((color,i)=>collection.add({id:entity,position,pixelSize:i<3?3.5:5,outlineWidth:i<3?2:4,color,outlineColor:color.withAlpha(.16),show:false,disableDepthTestDistance:0}));
    const phase=[...entity.id].reduce((n,c)=>n+c.charCodeAt(0),0)%120/100;entries.set(entity.id,{entity,anchor,points,phase});
   }
   for(const [id,e] of entries)if(!keep.has(id)){e.points.forEach(p=>collection.remove(p));entries.delete(id);}
  }
  for(const {entity,anchor,points,phase} of entries.values()){
   const matrix=entity.computeModelMatrix(time);if(!matrix)continue;
   const camera=C.Matrix4.multiplyByPoint(C.Matrix4.inverseTransformation(matrix,new C.Matrix4()),v.camera.positionWC,new C.Cartesian3());
   const angle=Math.atan2(camera.y,camera.x)*180/Math.PI,pulse=aircraftLightPulse(now/1000,phase,state.reduced);
   const show=[angle>=-5&&angle<=115,angle<=5&&angle>=-115,Math.abs(angle)>=110,pulse.strobe,pulse.strobe,pulse.beacon];
   const locations=[anchor.left,anchor.right,anchor.tail,anchor.left,anchor.right,anchor.beacon];
   points.forEach((p,i)=>{p.position=C.Matrix4.multiplyByPoint(matrix,C.Cartesian3.fromArray(lightAnchorToBody(locations[i])),new C.Cartesian3());p.show=entity.show&&show[i];});
  }
 };
 const remove=v.scene.preRender.addEventListener(update);
 const timer=setInterval(()=>{if(!v.isDestroyed()&&!document.hidden&&entries.size&&!getState().reduced)v.scene.requestRender();},40);v.scene.requestRender();
 return()=>{remove();clearInterval(timer);entries.clear();if(!v.isDestroyed())v.scene.primitives.remove(collection);};
}
