import {wheelMotion,type WheelMotion} from './wheelMotion.ts';
import {gearLayout,detailBudget} from './arrivalExperience.ts';
import type * as Cesium from 'cesium';
import type {Aircraft} from '../types';
import anchors from './aircraftGearAnchors.json' with {type:'json'};
import {sourcedModel} from './flightPresentation.ts';
import {aircraftGearConfiguration} from './aircraftRig.ts';
import {lightAnchorToBody} from './aircraftLights.ts';
const compressionByBody=new WeakMap<Cesium.Entity,number>();
export const gearCompression=(body:Cesium.Entity|undefined)=>body?compressionByBody.get(body)??0:0;
type Gear={main:number[];nose:number[];strut:number;radius:number};
// Fixed gear, skids, gliders and taildraggers keep their authored configuration.
const authoredGear=new Set(['ask21','pa28','pa32','c182','c208','dr40','ec35','gazl','b407','p40','pa18','pa22','sr22','dhc4']);
export function sourcedGearAnchors(type:string){const source=sourcedModel(type);return source&&!authoredGear.has(source.id)?(anchors as Record<string,Gear>)[source.id]:undefined;}
export function sourcedGearClearance(type:string,fallback=5){
 const gear=sourcedGearAnchors(type);
 return gear?Math.max(.2,-Math.min(gear.main[1],gear.nose[1])+gear.strut+gear.radius):fallback;
}
/** Illustrative gear; the feed does not report actual configuration. Community airframes remain intact. */
export function installLandingGear(C:typeof Cesium,v:Cesium.Viewer,getState:()=>{aircraft:Aircraft[];selected:Aircraft|null;quality?:string;reduced?:boolean}){
 type Entry={body:Cesium.Entity;parts:Cesium.Entity[];gear:Gear;extension:number;angle:number;compression:number;motion:WheelMotion};
 const entries=new Map<string,Entry>();let discovery=-Infinity,last=performance.now(),meanFrame=16;
 const removeEntry=(entry:Entry)=>{entry.parts.forEach(part=>v.entities.remove(part));compressionByBody.delete(entry.body);};
 const remove=v.scene.preRender.addEventListener(()=>{
  if(v.isDestroyed()||document.hidden)return;
  const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-last)/1000));meanFrame=meanFrame*.95+Math.min(100,now-last)*.05;last=now;
  const time=v.clock.currentTime,state=getState();
  if(now-discovery>300){
   discovery=now;const aircraft=new Map([...state.aircraft,...(state.selected?[state.selected]:[])].map(a=>[a.hex,a])),keep=new Set<string>();
   const bodies=v.entities.values.filter(e=>e.model&&e.show&&(e.id.startsWith('aircraft-')||e.id==='flight-simulation'));
   bodies.sort((a,b)=>Number(b.id.endsWith(state.selected?.hex??'!'))-Number(a.id.endsWith(state.selected?.hex??'!')));
   for(const body of bodies){
    if(keep.size>=detailBudget(state.quality??'balanced',meanFrame))break;
    const a=body.id==='flight-simulation'?state.selected:aircraft.get(body.id.slice(9));
    const source=a&&sourcedModel(a.aircraftType),position=body.position?.getValue(time);
    if(!source||!position||String(body.model!.uri?.getValue(time)).includes('/models/fleet/')||C.Cartesian3.distance(position,v.camera.positionWC)>2000)continue;
    const gear=sourcedGearAnchors(a!.aircraftType);if(!gear||C.Cartesian3.distance(position,v.camera.positionWC)>gear.strut/.035*18)continue;
    const target=aircraftGearConfiguration(body)?.gear??(a?.ground?1:0);
    if(!target&&(entries.get(body.id)?.extension??0)<=.01)continue;
    keep.add(body.id);const existing=entries.get(body.id);if(existing&&existing.gear===gear)continue;if(existing){removeEntry(existing);entries.delete(body.id);}
    const entry:Entry={body,parts:[],gear,extension:0,angle:0,compression:0,motion:{angle:0,omega:0,compression:0,velocity:0,ground:false,speed:0}};
    const legs=[gear.nose,gear.main,[-gear.main[0],gear.main[1],gear.main[2]]];
    const layout=gearLayout(a!.aircraftType);
    type Part={kind:'strut'|'piston'|'axle'|'wheel'|'hub'|'door';leg:number;dx:number;dz:number};
    const specs:Part[]=legs.flatMap((_,leg)=>{
     const parts:Part[]=[{kind:'strut',leg,dx:0,dz:0},{kind:'piston',leg,dx:0,dz:0},{kind:'axle',leg,dx:0,dz:0},{kind:'door',leg,dx:0,dz:0}];
     const axles=leg?layout.axles:1,paired=leg?layout.paired:true;
     for(let axle=0;axle<axles;axle++)for(const side of paired?[-1,1]:[0]){const dz=(axle-(axles-1)/2)*gear.radius*2.4;parts.push({kind:'wheel',leg,dx:side*gear.radius*.7,dz},{kind:'hub',leg,dx:side*gear.radius*1.13,dz});};
     return parts;
    });
    const extension=(leg:number)=>(legs[leg][1]-Math.min(gear.main[1],gear.nose[1])+gear.strut-entry.compression)*entry.extension;
    entry.parts=specs.map((part,i)=>v.entities.add({id:`landing-gear-${body.id}-${i}`,show:false,
     position:new C.CallbackPositionProperty((time,result)=>{
      const matrix=time&&body.computeModelMatrix(time);if(!matrix)return undefined;
      const leg=legs[part.leg],drop=part.kind==='door'?0:extension(part.leg)/(part.kind==='strut'?2:part.kind==='piston'?1.3:1),offset=[leg[0]+part.dx,leg[1]-drop,leg[2]+part.dz];
      return C.Matrix4.multiplyByPoint(matrix,C.Cartesian3.fromArray(lightAnchorToBody(offset)),result??new C.Cartesian3());
     },false),orientation:new C.CallbackProperty((time,result)=>{
      const base=body.orientation?.getValue(time);if(!base)return undefined;
      const angle=(part.kind==='wheel'||part.kind==='hub')?entry.angle:part.kind==='door'?entry.extension*1.3:0;
      return C.Quaternion.multiply(base,C.Quaternion.fromAxisAngle(part.kind==='door'?C.Cartesian3.UNIT_X:C.Cartesian3.UNIT_Y,angle),result??new C.Quaternion());
     },false),
     ...(part.kind==='strut'||part.kind==='piston'?{cylinder:{length:new C.CallbackProperty(()=>extension(part.leg)*(part.kind==='piston'?.45:.7),false),topRadius:gear.radius*(part.kind==='piston'?.11:.19),bottomRadius:gear.radius*(part.kind==='piston'?.11:.17),material:C.Color.fromCssColorString(part.kind==='piston'?'#dce4e8':'#7f8b94')}}:part.kind==='axle'?{box:{dimensions:new C.Cartesian3(gear.radius*Math.max(1,layout.axles)*2.3,gear.radius*1.9,gear.radius*.22),material:C.Color.fromCssColorString('#69757d')}}:part.kind==='hub'?{ellipsoid:{radii:new C.Cartesian3(gear.radius*.53,gear.radius*.06,gear.radius*.53),material:C.Color.fromCssColorString('#abb5bc'),stackPartitions:12,slicePartitions:20}}:part.kind==='door'?{box:{dimensions:new C.Cartesian3(gear.radius*2.8,gear.radius,gear.radius*.08),material:C.Color.LIGHTGRAY}}:{ellipsoid:{radii:new C.Cartesian3(gear.radius,gear.radius*.42,gear.radius),material:C.Color.fromCssColorString('#171a1d'),stackPartitions:16,slicePartitions:24}})}));
    entries.set(body.id,entry);
   }
   for(const [id,entry] of entries)if(!keep.has(id)){removeEntry(entry);entries.delete(id);}
  }
  for(const entry of entries.values()){
   const {body,parts}=entry,config=aircraftGearConfiguration(body),target=config?.gear??0;
   entry.motion=wheelMotion(entry.motion,config?.speed??0,config?.ground??false,entry.gear.radius,entry.gear.strut,dt,!!state.reduced);
   entry.angle=entry.motion.angle;entry.compression=entry.motion.compression;compressionByBody.set(body,entry.compression);
   entry.extension+=Math.max(-dt*.4,Math.min(dt*.4,target-entry.extension));
   const visible=body.show&&v.entities.contains(body)&&entry.extension>.01;
   parts.forEach(part=>{part.show=visible;});
   if(Math.abs(target-entry.extension)>.001||(!state.reduced&&config?.ground&&config.speed>0))v.scene.requestRender();
  }
 });
 return()=>{remove();if(!v.isDestroyed())for(const entry of entries.values())removeEntry(entry);entries.clear();};
}
