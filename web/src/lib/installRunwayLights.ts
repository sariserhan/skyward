import {runwayDatum} from './runwayDatum';
import type * as Cesium from 'cesium';
import type {AirportGeometry} from '../types';
import {runwayLighting,runwayFlash,runwayLampColor} from './runwayLighting';
import {solarElevation,sunDirectionFixed} from './solarLighting';

export function installRunwayLights(C:typeof Cesium,v:Cesium.Viewer,airports:AirportGeometry[],options:{quality?:string;reduced?:()=>boolean;flat?:boolean}={}){
 const media=window.matchMedia('(prefers-reduced-motion: reduce)'),colors=new Map<string,Cesium.Color>(),scratch=new C.Color();
 const lights=v.scene.primitives.add(new C.PointPrimitiveCollection()),low=options.quality==='low',cap=low?1000:2400;
 const selected=[...new Map(airports.map(a=>[a.id,a])).values()],budget=Math.max(49,Math.floor(cap/Math.max(1,selected.reduce((n,a)=>n+a.runways.length,0))));
 // Keep every runway: reduce spacing density uniformly rather than truncating later runways.
 const groups=selected.flatMap(airport=>airport.runways.map((runway,ri)=>{
  const center=C.Cartesian3.fromDegrees(((runway.a[0]+(((runway.b[0]-runway.a[0]+540)%360)-180)/2+540)%360)-180,(runway.a[1]+runway.b[1])/2),frame=C.Transforms.eastNorthUpToFixedFrame(center),inverse=C.Matrix4.inverseTransformation(frame,new C.Matrix4()),a=C.Matrix4.multiplyByPoint(inverse,C.Cartesian3.fromDegrees(...runway.a),new C.Cartesian3()),b=C.Matrix4.multiplyByPoint(inverse,C.Cartesian3.fromDegrees(...runway.b),new C.Cartesian3()),axis=C.Cartesian3.subtract(b,a,new C.Cartesian3()),length2=C.Cartesian3.magnitudeSquared(axis);
  const lamps=runwayLighting(runway,Math.max(low?120:60,runway.length/Math.max(4,Math.floor((budget-50)/3)))).map((lamp,i)=>({lamp,point:lights.add({id:`runway-light-${airport.id}-${ri}-${lamp.kind}-${i}`,position:C.Cartesian3.fromDegrees(lamp.lon,lamp.lat,2.5),pixelSize:3,color:C.Color.WHITE,outlineColor:C.Color.WHITE.withAlpha(.15),outlineWidth:2,distanceDisplayCondition:new C.DistanceDisplayCondition(0,35000),show:false})}));
  return {airport,runway,center,inverse,a,axis,length2,lamps,night:false};
 }));
 let lastTerrain=-Infinity,lastFrame=0,near=false;
 const update=()=>{if(v.isDestroyed()||document.hidden)return;const now=performance.now();if(now-lastFrame<40)return;lastFrame=now;
  const refresh=now-lastTerrain>2000,sun=refresh?sunDirectionFixed(C,v.clock.currentTime):null;near=false;
  const reduced=options.reduced?.()||media.matches;
  for(const group of groups){const visible=v.scene.mode===C.SceneMode.SCENE3D&&C.Cartesian3.distance(v.camera.positionWC,group.center)<37000;near||=visible;
   if(!visible){for(const {point} of group.lamps)point.show=false;continue;}
   if(sun)group.night=solarElevation(C,group.center,sun)<0;
   const eye=C.Matrix4.multiplyByPoint(group.inverse,v.camera.positionWC,new C.Cartesian3()),along=group.length2?C.Cartesian3.dot(C.Cartesian3.subtract(eye,group.a,eye),group.axis)/group.length2:0,reverse=along>.5;
   for(const {lamp,point} of group.lamps){
    // Atlas pavement is 1 m above the ellipsoid; lamps must clear it.
    // Ellipsoid tile chords can report negative heights, so only sample real terrain.
    if(refresh){const ground=options.flat||v.terrainProvider instanceof C.EllipsoidTerrainProvider?0:runwayDatum(v,group.airport);point.position=C.Cartesian3.fromDegrees(lamp.lon,lamp.lat,ground+2.5);}
    const outward=lamp.end===0?along<0:along>1,approach=['approach','crossbar','reil'].includes(lamp.kind),visibleApproach=lamp.end===0?along<.15:along>.85;
    point.show=(!approach||visibleApproach)&&(group.night||approach||lamp.kind==='threshold');
    const pulse=runwayFlash(lamp.kind,lamp.sequence,now/1000,!!reduced),hex=runwayLampColor(lamp,group.runway.length,reverse,outward);let color=colors.get(hex);if(!color){color=C.Color.fromCssColorString(hex);colors.set(hex,color);}
    point.color=color.withAlpha(pulse*(group.night?1:.75),scratch);point.outlineColor=color.withAlpha(pulse*(group.night?.22:.07),scratch);point.pixelSize=(approach?4:lamp.kind==='threshold'?4:3.5)*(group.night?1:.8);point.outlineWidth=group.night?3:1;
   }
  }
  if(refresh)lastTerrain=now;
 };
 const remove=v.scene.preRender.addEventListener(update),timer=setInterval(()=>{if(!v.isDestroyed()&&!document.hidden&&near&&!options.reduced?.()&&!media.matches)v.scene.requestRender();},50);
 const changed=()=>{lastFrame=-Infinity;if(!v.isDestroyed())v.scene.requestRender();};media.addEventListener('change',changed);v.scene.requestRender();return()=>{media.removeEventListener('change',changed);clearInterval(timer);remove();if(!v.isDestroyed())v.scene.primitives.remove(lights);};
}
