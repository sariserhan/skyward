import {installRunwayLights} from '../lib/installRunwayLights';
import {useEffect} from 'react';
import type * as Cesium from 'cesium';
import type {AirportGeometry} from '../types';
import {runwayMarkings} from '../lib/runwayDetails';
import {surfaceHeight} from '../lib/surfaceHeight';
/** Decorative lights align with mapped runways; operational lighting state is unavailable. */
export function AirportDetailLayer({viewer,airports,enabled,lightingEnabled=enabled,quality,reduced=false}:{viewer:Cesium.Viewer|null;airports:AirportGeometry[];enabled:boolean;lightingEnabled?:boolean;quality:string;reduced?:boolean}){
 useEffect(()=>{if(!viewer||viewer.isDestroyed()||!lightingEnabled)return;return installRunwayLights(window.Cesium,viewer,airports,{quality,reduced:()=>reduced});},[viewer,airports,lightingEnabled,quality,reduced]);
 useEffect(()=>{const v=viewer;if(!v||v.isDestroyed()||!enabled)return;const C=window.Cesium,source=new C.CustomDataSource('mapped-airport-detail');let alive=true;
 void v.dataSources.add(source).then(()=>{if(!alive&&!v.isDestroyed())v.dataSources.remove(source,true);});
 for(const airport of airports.slice(0,2)){

  for(const [ri,runway] of airport.runways.slice(0,6).entries())for(const [i,line] of runwayMarkings(runway).entries())source.entities.add({id:`runway-mark-${airport.id}-${ri}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArray(line.flat()),clampToGround:true,width:i<Math.ceil(runway.length/120)?2:3,material:C.Color.WHITE.withAlpha(.85),distanceDisplayCondition:new C.DistanceDisplayCondition(0,6500)}});
  for(const [i,path] of airport.paths.filter(p=>['taxiway','taxilane','parking_position'].includes(p.kind)&&p.points.length>1).slice(0,quality==='low'?35:100).entries())source.entities.add({id:`detail-taxi-${airport.id}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArray(path.points.flat()),clampToGround:true,width:1.5,material:C.Color.fromCssColorString('#d0ad56').withAlpha(.8),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}});
  for(const [i,surface] of airport.surfaces.filter(s=>s.kind==='terminal'&&s.points.length>=3).slice(0,30).entries()){const h=surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(airport.lon,airport.lat)))+Math.max(3,surface.height)+.5;source.entities.add({id:`detail-terminal-${airport.id}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArrayHeights([...surface.points,surface.points[0]].flatMap(p=>[...p,h])),width:1,material:C.Color.fromCssColorString('#aec1c5').withAlpha(.7),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}});}
 }
 v.scene.requestRender();
 return()=>{alive=false;if(!v.isDestroyed()){v.dataSources.remove(source,true);v.scene.requestRender();}};
 },[viewer,airports,enabled,quality,reduced]);return null;
}
