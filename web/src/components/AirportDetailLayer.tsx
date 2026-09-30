import {sharedLiveMotion} from '../lib/liveMotion';
import {aircraftRadius} from '../lib/groundSafety';
import {apronSurfaceMaterial} from '../lib/apronSurface';
import {airportPolygonHierarchy} from '../lib/airportBuildings';
import {runwayDatums} from '../lib/runwayTerrain';
import {runwayDatum} from '../lib/runwayDatum';
import {runwaySurfaceCorners,runwaySurfaceMaterial} from '../lib/runwaySurface';
import {airportStandDetails} from '../lib/airportScenery';
import {installRunwayLights} from '../lib/installRunwayLights';
import {useEffect,useState,useRef} from 'react';
import type * as Cesium from 'cesium';
import type {AirportGeometry,Aircraft} from '../types';
import {runwayMarkings} from '../lib/runwayDetails';
import {surfaceHeight} from '../lib/surfaceHeight';
/** Decorative lights align with mapped runways; operational lighting state is unavailable. */
export function AirportDetailLayer({viewer,airports,enabled,lightingEnabled=enabled,quality,reduced=false,selected}:{viewer:Cesium.Viewer|null;airports:AirportGeometry[];enabled:boolean;lightingEnabled?:boolean;quality:string;reduced?:boolean;selected?:Aircraft|null}){
 const selectedRef=useRef(selected);selectedRef.current=selected;
 const [activeGate,setActiveGate]=useState('');
 const [nearby,setNearby]=useState(false),[terrainRevision,setTerrainRevision]=useState(0);
 useEffect(()=>{if(!viewer||viewer.isDestroyed())return;return viewer.scene.globe.terrainProviderChanged.addEventListener(()=>setTerrainRevision(n=>n+1));},[viewer]);
 useEffect(()=>{if(!viewer||viewer.isDestroyed()||!enabled){setNearby(false);return;}const C=window.Cesium;
  const update=()=>{if(viewer.isDestroyed())return;const a=selectedRef.current;setActiveGate(a?sharedLiveMotion.displayed(a.hex)?.gate??'':'');setNearby(airports.some(a=>C.Cartesian3.distance(viewer.camera.positionWC,C.Cartesian3.fromDegrees(a.lon,a.lat))<12000));};
  update();const stop=viewer.camera.moveEnd.addEventListener(update),timer=setInterval(update,1000);return()=>{stop();clearInterval(timer);};
 },[viewer,airports,enabled]);
 useEffect(()=>{if(!viewer||viewer.isDestroyed()||!lightingEnabled)return;return installRunwayLights(window.Cesium,viewer,airports,{quality,reduced:()=>reduced});},[viewer,airports,lightingEnabled,quality,reduced]);
 useEffect(()=>{const v=viewer;if(!v||v.isDestroyed()||!enabled||!nearby)return;const C=window.Cesium,source=new C.CustomDataSource('mapped-airport-detail');let alive=true;const resample:Array<()=>void>=[];let terrainTimer:ReturnType<typeof setTimeout>|undefined;
 void v.dataSources.add(source).then(()=>{if(!alive&&!v.isDestroyed())v.dataSources.remove(source,true);});
 const pavement=runwaySurfaceMaterial(C,v),apron=apronSurfaceMaterial(C);
 for(const airport of airports.slice(0,2)){
  // Real apron boundaries only: do not cover surrounding roads, water or courtyards.
  for(const [i,surface] of airport.surfaces.entries())if(surface.kind==='apron'&&surface.points.length>=3)source.entities.add({id:`apron-surface-${airport.id}-${i}`,name:'Mapped apron · illustrative pavement',polygon:{hierarchy:airportPolygonHierarchy(C,surface),height:runwayDatums.has(airport.id)?runwayDatum(v,airport)+.15:new C.CallbackProperty(()=>runwayDatum(v,airport)+.15,false),material:apron,distanceDisplayCondition:new C.DistanceDisplayCondition(0,12000)}});
  if(quality!=='low')for(const [i,runway] of airport.runways.slice(0,6).entries()){const corners=runwaySurfaceCorners(runway);if(corners.length)source.entities.add({id:`runway-surface-${airport.id}-${i}`,name:'Illustrative runway surface',polygon:{hierarchy:C.Cartesian3.fromDegreesArray(corners.flat()),granularity:C.Math.toRadians(.001),height:runwayDatums.has(airport.id)?runwayDatum(v,airport)+.3:new C.CallbackProperty(()=>runwayDatum(v,airport)+.3,false),material:pavement,stRotation:Math.atan2(runway.b[1]-runway.a[1],(runway.b[0]-runway.a[0])*Math.cos(airport.lat*Math.PI/180))-Math.PI/2,distanceDisplayCondition:new C.DistanceDisplayCondition(0,6500)}});}

  for(const [i,stand] of airportStandDetails(airport,airport.gates.length).sort((a,b)=>Number(b.label===activeGate)-Number(a.label===activeGate)).slice(0,quality==='low'?12:64).entries()){
   const height=(p:[number,number])=>surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(...p)));
   let end=[...stand.end] as [number,number],lastDock=performance.now();
   const bridgeEnd=()=>{
    const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-lastDock)/1000));lastDock=now;
    const a=selectedRef.current,f=a?sharedLiveMotion.displayed(a.hex):null;let target=stand.end;
    if(a&&f?.ground&&f.landingPhase==='parked'&&f.gate===stand.label&&Math.hypot((f.lon-stand.gate[0])*Math.cos(airport.lat*Math.PI/180),f.lat-stand.gate[1])*111120<90){
     // Approximate left forward passenger door; the model does not expose a surveyed door anchor.
     const h=f.heading*Math.PI/180,forward=aircraftRadius(a.aircraftType)*.45,left=2.5;
     target=[f.lon+(Math.sin(h)*forward-Math.cos(h)*left)/(111120*Math.cos(f.lat*Math.PI/180)),f.lat+(Math.cos(h)*forward+Math.sin(h)*left)/111120];
    }
    const distance=Math.hypot((target[0]-end[0])*Math.cos(airport.lat*Math.PI/180),target[1]-end[1])*111120,t=Math.min(1,dt/Math.max(.001,distance));
    end=[end[0]+(target[0]-end[0])*t,end[1]+(target[1]-end[1])*t];return end;
   };
   const bridge=source.entities.add({id:`illustrative-bridge-${airport.id}-${i}`,name:'Illustrative boarding bridge',polylineVolume:{positions:C.Cartesian3.fromDegreesArrayHeights([stand.start,stand.end].flatMap(p=>[...p,height(p)+4.2])),shape:[new C.Cartesian2(-1.2,-1.1),new C.Cartesian2(1.2,-1.1),new C.Cartesian2(1.2,1.1),new C.Cartesian2(-1.2,1.1)],material:C.Color.fromCssColorString('#83959d'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,2500)}});
   const support=source.entities.add({id:`illustrative-bridge-support-${airport.id}-${i}`,position:C.Cartesian3.fromDegrees(...stand.end,height(stand.end)+1.5),cylinder:{length:3,topRadius:.3,bottomRadius:.3,material:C.Color.DARKGRAY,distanceDisplayCondition:new C.DistanceDisplayCondition(0,1500)}});
   const cab=source.entities.add({id:`illustrative-bridge-cab-${airport.id}-${i}`,name:`Gate ${stand.label} · illustrative boarding bridge`,position:C.Cartesian3.fromDegrees(...stand.end,height(stand.end)+4.2),box:{dimensions:new C.Cartesian3(3.2,3.2,2.6),material:C.Color.fromCssColorString('#819ca6'),outline:true,outlineColor:C.Color.fromCssColorString('#34434a'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,2500)},label:{text:stand.label,font:'bold 12px sans-serif',fillColor:C.Color.WHITE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#152b34'),pixelOffset:new C.Cartesian2(0,-20),distanceDisplayCondition:new C.DistanceDisplayCondition(0,1200)}});
   let drawn=[...stand.end],baseHeight=height(stand.start),endHeight=height(stand.end);
   resample.push(()=>{const p=bridgeEnd(),h=height(p),base=height(stand.start);if(Math.hypot(p[0]-drawn[0],p[1]-drawn[1])<1e-7&&Math.abs(h-endHeight)<.1&&Math.abs(base-baseHeight)<.1)return;drawn=[...p];endHeight=h;baseHeight=base;bridge.polylineVolume!.positions=new C.ConstantProperty(C.Cartesian3.fromDegreesArrayHeights([...stand.start,base+4.2,...p,h+4.2]));support.position=new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(...p,h+1.5));cab.position=new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(...p,h+4.2));v.scene.requestRender();});
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
 const dockTimer=setInterval(()=>{if(!alive||v.isDestroyed()||document.hidden)return;resample.forEach(update=>update());},100);
 const terrainStop=v.scene.globe.tileLoadProgressEvent.addEventListener((count:number)=>{if(count)return;clearTimeout(terrainTimer);terrainTimer=setTimeout(()=>{if(!alive||v.isDestroyed())return;resample.forEach(update=>update());v.scene.requestRender();},300);});
 v.scene.requestRender();
 return()=>{alive=false;clearInterval(dockTimer);terrainStop();clearTimeout(terrainTimer);if(!v.isDestroyed()){v.dataSources.remove(source,true);v.scene.requestRender();}};
 },[viewer,airports,enabled,quality,reduced,nearby,terrainRevision,activeGate]);return null;
}
