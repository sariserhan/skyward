import {useEffect,useRef} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft,FlightRoute,TrailPoint} from '../types';
import {coloredTrail} from '../lib/positionQuality';
import {routeArc} from '../lib/routeOverview';

/** Presentation path, including estimated motion. Never stored as received observations. */
export function FollowFlightPath({viewer,aircraft,trail,route,active}:{viewer:Cesium.Viewer|null;aircraft:Aircraft|null;trail:TrailPoint[];route:FlightRoute|null;active:boolean}){
 const latest=useRef({trail,route});latest.current={trail,route};
 useEffect(()=>{
  if(!active||!viewer||viewer.isDestroyed()||!aircraft)return;
  const v=viewer,C=window.Cesium,hex=aircraft.hex,entities:Cesium.Entity[]=[];
  const body=()=>v.entities.getById(`aircraft-${hex}`)?.position?.getValue(v.clock.currentTime);
  const material=(color:string)=>new C.PolylineOutlineMaterialProperty({color:C.Color.fromCssColorString(color),outlineColor:C.Color.fromCssColorString('#0b202c'),outlineWidth:1});
  const segments=coloredTrail(latest.current.trail).map(s=>s.points.map(p=>C.Cartesian3.fromDegrees(p.lon,p.lat,Math.max(0,p.altitude)*.3048+8)));
  for(const positions of segments.slice(0,-1))entities.push(v.entities.add({name:'Received flight history',polyline:{positions,width:4,material:material('#8fdfc8')}}));
  let samples=segments.at(-1)?.slice()??[],lastSample=0;
  const green=v.entities.add({id:'follow-flight-trail',name:'Displayed flight path · includes estimated motion',polyline:{positions:new C.CallbackProperty(()=>{const p=body();return p?[...samples,p]:samples;},false),width:4,arcType:C.ArcType.NONE,material:material('#8fdfc8')}});entities.push(green);
  const remove=v.scene.preUpdate.addEventListener(()=>{
   if(document.hidden)return;const p=body(),now=performance.now();if(!p||now-lastSample<250)return;lastSample=now;
   if(!samples.length||C.Cartesian3.distance(samples.at(-1)!,p)>=5)samples.push(C.Cartesian3.clone(p));
   // Keep the recent curve detailed and simplify older presentation history.
   if(samples.length>1024)samples=[...samples.slice(0,512).filter((_,i)=>i%2===0),...samples.slice(512)];
  });
  entities.push(v.entities.add({id:'follow-flight-ahead',name:'Estimated route to destination',polyline:{positions:new C.CallbackProperty(()=>{
   const p=body(),r=latest.current.route;if(!p||!r||r.airports.length!==2||!['PLAUSIBLE','UNVERIFIED'].includes(r.status))return [];
   const from=C.Cartographic.fromCartesian(p),arc=routeArc({lon:C.Math.toDegrees(from.longitude),lat:C.Math.toDegrees(from.latitude)},r.airports[1]);
   const positions=arc.map((point,i)=>C.Cartesian3.fromDegrees(point.lon,point.lat,from.height+(5000-from.height)*i/(arc.length-1)));
   positions[0]=p;return positions;
  },false),width:4,arcType:C.ArcType.NONE,material:material('#c9a4f7')}}));
  v.scene.requestRender();
  return()=>{remove();if(!v.isDestroyed()){for(const e of entities)v.entities.remove(e);v.scene.requestRender();}};
 },[viewer,aircraft?.hex,active]);
 return null;
}
