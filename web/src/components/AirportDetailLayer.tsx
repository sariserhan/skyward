import {useEffect} from 'react';
import type * as Cesium from 'cesium';
import type {AirportGeometry} from '../types';
import {runwayLightPoints,runwayMarkings,approachLightPoints} from '../lib/runwayDetails';
import {surfaceHeight} from '../lib/surfaceHeight';
import {solarElevation,sunDirectionFixed} from '../lib/solarLighting';
/** Decorative lights align with mapped runways; operational lighting state is unavailable. */
export function AirportDetailLayer({viewer,airports,enabled,quality}:{viewer:Cesium.Viewer|null;airports:AirportGeometry[];enabled:boolean;quality:string}){
 useEffect(()=>{const v=viewer;if(!v||v.isDestroyed()||!enabled)return;const C=window.Cesium,lights=v.scene.primitives.add(new C.PointPrimitiveCollection()),source=new C.CustomDataSource('mapped-airport-detail');let alive=true;
 void v.dataSources.add(source).then(()=>{if(!alive&&!v.isDestroyed())v.dataSources.remove(source,true);});
 const points:{point:Cesium.PointPrimitive;lon:number;lat:number}[]=[];const cap=quality==='low'?160:quality==='high'?600:320;
 for(const airport of airports.slice(0,2)){
  for(const runway of airport.runways){const all=[...approachLightPoints(runway),...runwayLightPoints(runway)],budget=Math.max(8,Math.floor(cap/Math.max(1,airports.slice(0,2).reduce((n,a)=>n+a.runways.length,0))));for(const p of all.filter((_,i)=>i%Math.max(1,Math.ceil(all.length/budget))===0)){if(points.length>=cap)break;points.push({point:lights.add({position:C.Cartesian3.fromDegrees(p.lon,p.lat,1),pixelSize:p.threshold?3:2,color:p.threshold?C.Color.fromCssColorString('#7df7a5'):C.Color.fromCssColorString('#ffefd0'),outlineColor:C.Color.fromCssColorString('#fff2cc').withAlpha(.12),outlineWidth:2,distanceDisplayCondition:new C.DistanceDisplayCondition(0,16000)}),...p});}}
  for(const [ri,runway] of airport.runways.slice(0,6).entries())for(const [i,line] of runwayMarkings(runway).entries())source.entities.add({id:`runway-mark-${airport.id}-${ri}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArray(line.flat()),clampToGround:true,width:i<Math.ceil(runway.length/120)?2:3,material:C.Color.WHITE.withAlpha(.85),distanceDisplayCondition:new C.DistanceDisplayCondition(0,6500)}});
  for(const [i,path] of airport.paths.filter(p=>['taxiway','taxilane','parking_position'].includes(p.kind)&&p.points.length>1).slice(0,quality==='low'?35:100).entries())source.entities.add({id:`detail-taxi-${airport.id}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArray(path.points.flat()),clampToGround:true,width:1.5,material:C.Color.fromCssColorString('#d0ad56').withAlpha(.8),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}});
  for(const [i,surface] of airport.surfaces.filter(s=>s.kind==='terminal'&&s.points.length>=3).slice(0,30).entries()){const h=surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(airport.lon,airport.lat)))+Math.max(3,surface.height)+.5;source.entities.add({id:`detail-terminal-${airport.id}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArrayHeights([...surface.points,surface.points[0]].flatMap(p=>[...p,h])),width:1,material:C.Color.fromCssColorString('#aec1c5').withAlpha(.7),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}});}
 }
 let last=0;const update=()=>{if(v.isDestroyed()||document.hidden||performance.now()-last<1500)return;last=performance.now();const sun=sunDirectionFixed(C,v.clock.currentTime);for(const p of points){const position=C.Cartesian3.fromDegrees(p.lon,p.lat,surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(p.lon,p.lat)))+1);p.point.position=position;p.point.show=solarElevation(C,position,sun)<0;}v.scene.requestRender();};const remove=v.scene.preUpdate.addEventListener(update);update();v.scene.requestRender();
 return()=>{alive=false;remove();if(!v.isDestroyed()){v.scene.primitives.remove(lights);v.dataSources.remove(source,true);v.scene.requestRender();}};
 },[viewer,airports,enabled,quality]);return null;
}
