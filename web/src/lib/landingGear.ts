import type * as Cesium from 'cesium';
import type {Aircraft} from '../types';
import anchors from './aircraftGearAnchors.json' with {type:'json'};
import {sourcedModel} from './flightPresentation.ts';
import {aircraftGearConfiguration} from './aircraftRig.ts';
import {lightAnchorToBody} from './aircraftLights.ts';
type Gear={main:number[];nose:number[];strut:number;radius:number};
// Fixed gear, skids, gliders and taildraggers keep their authored configuration.
const authoredGear=new Set(['ask21','pa28','pa32','c182','c208','dr40','ec35','gazl','p40','pa18','pa22','sr22','dhc4']);
export function sourcedGearAnchors(type:string){const source=sourcedModel(type);return source&&!authoredGear.has(source.id)?(anchors as Record<string,Gear>)[source.id]:undefined;}
export function sourcedGearClearance(type:string,fallback=5){
 const gear=sourcedGearAnchors(type);
 return gear?Math.max(.2,-Math.min(gear.main[1],gear.nose[1])+gear.strut+gear.radius):fallback;
}
/** Illustrative gear; the feed does not report actual configuration. Community airframes remain intact. */
export function installLandingGear(C:typeof Cesium,v:Cesium.Viewer,getState:()=>{aircraft:Aircraft[];selected:Aircraft|null}){
 type Entry={body:Cesium.Entity;parts:Cesium.Entity[];gear:Gear;extension:number};
 const entries=new Map<string,Entry>();let discovery=-Infinity,last=performance.now();
 const removeEntry=(entry:Entry)=>entry.parts.forEach(part=>v.entities.remove(part));
 const remove=v.scene.preRender.addEventListener(()=>{
  if(v.isDestroyed()||document.hidden)return;
  const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  const time=v.clock.currentTime,state=getState();
  if(now-discovery>300){
   discovery=now;const aircraft=new Map([...state.aircraft,...(state.selected?[state.selected]:[])].map(a=>[a.hex,a])),keep=new Set<string>();
   const bodies=v.entities.values.filter(e=>e.model&&e.show&&(e.id.startsWith('aircraft-')||e.id==='flight-simulation'));
   bodies.sort((a,b)=>Number(b.id.endsWith(state.selected?.hex??'!'))-Number(a.id.endsWith(state.selected?.hex??'!')));
   for(const body of bodies){
    if(keep.size>=12)break;
    const a=body.id==='flight-simulation'?state.selected:aircraft.get(body.id.slice(9));
    const source=a&&sourcedModel(a.aircraftType),position=body.position?.getValue(time);
    if(!source||!position||String(body.model!.uri?.getValue(time)).includes('/models/fleet/')||C.Cartesian3.distance(position,v.camera.positionWC)>2000)continue;
    const gear=sourcedGearAnchors(a!.aircraftType);if(!gear||C.Cartesian3.distance(position,v.camera.positionWC)>gear.strut/.035*25)continue;
    const target=aircraftGearConfiguration(body)?.gear??(a?.ground?1:0);
    if(!target&&(entries.get(body.id)?.extension??0)<=.01)continue;
    keep.add(body.id);const existing=entries.get(body.id);if(existing&&existing.gear===gear)continue;if(existing){removeEntry(existing);entries.delete(body.id);}
    const entry:Entry={body,parts:[],gear,extension:0};
    const legs=[gear.nose,gear.main,[-gear.main[0],gear.main[1],gear.main[2]]];
    const extension=(i:number)=>(legs[Math.floor(i/2)][1]-Math.min(gear.main[1],gear.nose[1])+gear.strut)*entry.extension;
    // Evaluate from the body's current pose, not a preRender snapshot. A saved
    // position trails the airframe by one frame, visibly at low frame rates.
    entry.parts=Array.from({length:6},(_,i)=>v.entities.add({id:`landing-gear-${body.id}-${i}`,show:false,
     position:new C.CallbackPositionProperty((time,result)=>{
      const matrix=time&&body.computeModelMatrix(time);if(!matrix)return undefined;
      const leg=legs[Math.floor(i/2)],offset=[leg[0],leg[1]-extension(i)/(i%2?1:2),leg[2]];
      return C.Matrix4.multiplyByPoint(matrix,C.Cartesian3.fromArray(lightAnchorToBody(offset)),result??new C.Cartesian3());
     },false),orientation:new C.CallbackProperty((time,result)=>body.orientation?.getValue(time,result),false),
     ...(i%2===0?{cylinder:{length:new C.CallbackProperty(()=>extension(i),false),topRadius:gear.radius*.15,bottomRadius:gear.radius*.15,material:C.Color.SILVER}}:{ellipsoid:{radii:new C.Cartesian3(gear.radius,gear.radius*.48,gear.radius),material:C.Color.fromCssColorString('#15181c'),stackPartitions:12,slicePartitions:16}})}));
    entries.set(body.id,entry);
   }
   for(const [id,entry] of entries)if(!keep.has(id)){removeEntry(entry);entries.delete(id);}
  }
  for(const entry of entries.values()){
   const {body,parts}=entry,target=aircraftGearConfiguration(body)?.gear??0;
   entry.extension+=Math.max(-dt*.4,Math.min(dt*.4,target-entry.extension));
   const visible=body.show&&v.entities.contains(body)&&entry.extension>.01;
   parts.forEach(part=>{part.show=visible;});
   if(Math.abs(target-entry.extension)>.001)v.scene.requestRender();
  }
 });
 return()=>{remove();if(!v.isDestroyed())for(const entry of entries.values())removeEntry(entry);entries.clear();};
}
