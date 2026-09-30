import {runwayDatums} from '../lib/runwayTerrain';
import {runwayDatum} from '../lib/runwayDatum';
import {runwaySurfaceCorners,runwaySurfaceMaterial} from '../lib/runwaySurface';
import {airportStandDetails} from '../lib/airportScenery';
import {installRunwayLights} from '../lib/installRunwayLights';
import {useEffect,useState} from 'react';
import type * as Cesium from 'cesium';
import type {AirportGeometry} from '../types';
import {runwayMarkings} from '../lib/runwayDetails';
import {surfaceHeight} from '../lib/surfaceHeight';
/** Decorative lights align with mapped runways; operational lighting state is unavailable. */
export function AirportDetailLayer({viewer,airports,enabled,lightingEnabled=enabled,quality,reduced=false}:{viewer:Cesium.Viewer|null;airports:AirportGeometry[];enabled:boolean;lightingEnabled?:boolean;quality:string;reduced?:boolean}){
 const [nearby,setNearby]=useState(false),[terrainRevision,setTerrainRevision]=useState(0);
 useEffect(()=>{if(!viewer||viewer.isDestroyed())return;return viewer.scene.globe.terrainProviderChanged.addEventListener(()=>setTerrainRevision(n=>n+1));},[viewer]);
 useEffect(()=>{if(!viewer||viewer.isDestroyed()||!enabled){setNearby(false);return;}const C=window.Cesium;
  const update=()=>{if(viewer.isDestroyed())return;setNearby(airports.some(a=>C.Cartesian3.distance(viewer.camera.positionWC,C.Cartesian3.fromDegrees(a.lon,a.lat))<12000));};
  update();const stop=viewer.camera.moveEnd.addEventListener(update),timer=setInterval(update,1000);return()=>{stop();clearInterval(timer);};
 },[viewer,airports,enabled]);
 useEffect(()=>{if(!viewer||viewer.isDestroyed()||!lightingEnabled)return;return installRunwayLights(window.Cesium,viewer,airports,{quality,reduced:()=>reduced});},[viewer,airports,lightingEnabled,quality,reduced]);
 useEffect(()=>{const v=viewer;if(!v||v.isDestroyed()||!enabled||!nearby)return;const C=window.Cesium,source=new C.CustomDataSource('mapped-airport-detail');let alive=true;const resample:Array<()=>void>=[];let terrainTimer:ReturnType<typeof setTimeout>|undefined;
 void v.dataSources.add(source).then(()=>{if(!alive&&!v.isDestroyed())v.dataSources.remove(source,true);});
 const pavement=runwaySurfaceMaterial(C,v);
 for(const airport of airports.slice(0,2)){
  if(quality!=='low')for(const [i,runway] of airport.runways.slice(0,6).entries()){const corners=runwaySurfaceCorners(runway);if(corners.length)source.entities.add({id:`runway-surface-${airport.id}-${i}`,name:'Illustrative runway surface',polygon:{hierarchy:C.Cartesian3.fromDegreesArray(corners.flat()),granularity:C.Math.toRadians(.001),height:runwayDatums.has(airport.id)?runwayDatum(v,airport)+.3:new C.CallbackProperty(()=>runwayDatum(v,airport)+.3,false),material:pavement,stRotation:Math.atan2(runway.b[1]-runway.a[1],(runway.b[0]-runway.a[0])*Math.cos(airport.lat*Math.PI/180))-Math.PI/2,distanceDisplayCondition:new C.DistanceDisplayCondition(0,6500)}});}

  for(const [i,stand] of airportStandDetails(airport,quality==='low'?4:16).entries()){
   const height=(p:[number,number])=>surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(...p)));
   const bridge=source.entities.add({id:`illustrative-bridge-${airport.id}-${i}`,name:'Illustrative boarding bridge',polylineVolume:{positions:C.Cartesian3.fromDegreesArrayHeights([stand.start,stand.end].flatMap(p=>[...p,height(p)+4.2])),shape:[new C.Cartesian2(-1.2,-1.1),new C.Cartesian2(1.2,-1.1),new C.Cartesian2(1.2,1.1),new C.Cartesian2(-1.2,1.1)],material:C.Color.fromCssColorString('#83959d'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,2500)}});
   const support=source.entities.add({id:`illustrative-bridge-support-${airport.id}-${i}`,position:C.Cartesian3.fromDegrees(...stand.end,height(stand.end)+1.5),cylinder:{length:3,topRadius:.3,bottomRadius:.3,material:C.Color.DARKGRAY,distanceDisplayCondition:new C.DistanceDisplayCondition(0,1500)}});
   let elevation=[height(stand.start),height(stand.end)];resample.push(()=>{const next=[height(stand.start),height(stand.end)];if(next.every((h,j)=>Math.abs(h-elevation[j])<.1))return;elevation=next;bridge.polylineVolume!.positions=new C.ConstantProperty(C.Cartesian3.fromDegreesArrayHeights([stand.start,stand.end].flatMap((p,j)=>[...p,next[j]+4.2])));support.position=new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(...stand.end,next[1]+1.5));});
   if(stand.cart){const [lon,lat]=stand.cart,cos=Math.cos(lat*Math.PI/180);
    source.entities.add({id:`illustrative-cart-${airport.id}-${i}`,name:'Illustrative parked baggage cart',position:C.Cartesian3.fromDegrees(lon,lat,.9),box:{dimensions:new C.Cartesian3(2.8,1.5,1.1),heightReference:C.HeightReference.RELATIVE_TO_GROUND,material:C.Color.fromCssColorString('#c7b365'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,1200)}});
    for(const [j,offset] of [[-1,-.8],[-1,.8],[1,-.8],[1,.8]].entries())source.entities.add({id:`illustrative-cart-wheel-${airport.id}-${i}-${j}`,position:C.Cartesian3.fromDegrees(lon+offset[0]/111320/cos,lat+offset[1]/111320,.3),ellipsoid:{radii:new C.Cartesian3(.3,.12,.3),heightReference:C.HeightReference.RELATIVE_TO_GROUND,material:C.Color.fromCssColorString('#222629'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,700)}});
   }
   source.entities.add({id:`stand-mark-${airport.id}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArray([...stand.end,...stand.gate]),clampToGround:true,width:2,material:C.Color.fromCssColorString('#d0ad56'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,2000)}});
  }
  for(const [ri,runway] of airport.runways.slice(0,6).entries())for(const [i,line] of runwayMarkings(runway).entries())source.entities.add({id:`runway-mark-${airport.id}-${ri}-${i}`,polyline:{positions:runwayDatums.has(airport.id)?C.Cartesian3.fromDegreesArrayHeights(line.flatMap(p=>[...p,runwayDatum(v,airport)+.4])):new C.CallbackProperty(()=>C.Cartesian3.fromDegreesArrayHeights(line.flatMap(p=>[...p,runwayDatum(v,airport)+.4])),false),arcType:C.ArcType.NONE,width:i<Math.ceil(runway.length/120)?2:3,material:C.Color.WHITE.withAlpha(.85),distanceDisplayCondition:new C.DistanceDisplayCondition(0,6500)}});
  for(const [i,path] of airport.paths.filter(p=>['taxiway','taxilane','parking_position'].includes(p.kind)&&p.points.length>1).slice(0,quality==='low'?35:100).entries())source.entities.add({id:`detail-taxi-${airport.id}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArray(path.points.flat()),clampToGround:true,width:1.5,material:C.Color.fromCssColorString('#d0ad56').withAlpha(.8),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}});
  for(const [i,surface] of airport.surfaces.filter(s=>s.kind==='terminal'&&s.points.length>=3).slice(0,30).entries()){const h=surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(airport.lon,airport.lat)))+Math.max(3,surface.height)+.5;source.entities.add({id:`detail-terminal-${airport.id}-${i}`,polyline:{positions:C.Cartesian3.fromDegreesArrayHeights([...surface.points,surface.points[0]].flatMap(p=>[...p,h])),width:1,material:C.Color.fromCssColorString('#aec1c5').withAlpha(.7),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}});}
 }
 const terrainStop=v.scene.globe.tileLoadProgressEvent.addEventListener((count:number)=>{if(count)return;clearTimeout(terrainTimer);terrainTimer=setTimeout(()=>{if(!alive||v.isDestroyed())return;resample.forEach(update=>update());v.scene.requestRender();},300);});
 v.scene.requestRender();
 return()=>{alive=false;terrainStop();clearTimeout(terrainTimer);if(!v.isDestroyed()){v.dataSources.remove(source,true);v.scene.requestRender();}};
 },[viewer,airports,enabled,quality,reduced,nearby,terrainRevision]);return null;
}
