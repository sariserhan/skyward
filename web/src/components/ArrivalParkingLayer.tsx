import {useEffect} from 'react';
import type * as Cesium from 'cesium';
import {sharedLiveMotion} from '../lib/liveMotion';
/** Generic pavement exists only inside the watched arrival, never in airport source data. */
export function ArrivalParkingLayer({viewer:v,hex,enabled}:{viewer:Cesium.Viewer|null;hex:string;enabled:boolean}){
 useEffect(()=>{
  if(!v||v.isDestroyed()||!enabled)return;const C=window.Cesium;let current:unknown,entities:Cesium.Entity[]=[];
  const clear=()=>{for(const e of entities)v.entities.remove(e);entities=[];};
  const update=()=>{if(v.isDestroyed())return;const route=sharedLiveMotion.arrivalLayout(hex);if(route===current)return;current=route;clear();if(!route){v.scene.requestRender();return;}
   const end=route.points.at(-1)!,c=Math.max(.1,Math.cos(end.lat*Math.PI/180)),lon=55/(111120*c),lat=55/111120;
   entities.push(v.entities.add({id:`arrival-fallback-apron-${hex}`,rectangle:{coordinates:C.Rectangle.fromDegrees(end.lon-lon,end.lat-lat,end.lon+lon,end.lat+lat),material:C.Color.fromCssColorString('#414e52'),classificationType:C.ClassificationType.TERRAIN}}));
   entities.push(v.entities.add({id:`arrival-fallback-taxi-${hex}`,corridor:{positions:C.Cartesian3.fromDegreesArray(route.points.flatMap(p=>[p.lon,p.lat])),width:30,cornerType:C.CornerType.ROUNDED,material:C.Color.fromCssColorString('#414e52'),classificationType:C.ClassificationType.TERRAIN}}));
   entities.push(v.entities.add({id:`arrival-fallback-line-${hex}`,polyline:{positions:C.Cartesian3.fromDegreesArray(route.points.flatMap(p=>[p.lon,p.lat])),width:2,clampToGround:true,material:C.Color.fromCssColorString('#d8bd65')}}));
   entities.push(v.entities.add({id:`arrival-fallback-stand-${hex}`,position:C.Cartesian3.fromDegrees(end.lon,end.lat),label:{text:'Illustrative parking stand',font:'12px sans-serif',heightReference:C.HeightReference.CLAMP_TO_GROUND,pixelOffset:new C.Cartesian2(0,-40),showBackground:true,distanceDisplayCondition:new C.DistanceDisplayCondition(0,2000)}}));v.scene.requestRender();
  };update();const timer=setInterval(update,500);return()=>{clearInterval(timer);if(!v.isDestroyed()){clear();v.scene.requestRender();}};
 },[v,hex,enabled]);return null;
}
