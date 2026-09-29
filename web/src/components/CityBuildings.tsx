import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type * as Cesium from 'cesium';
import type {AirportGeometry} from '../types';
import {cityTiles,type CityTile,type CityBuilding} from '../lib/cityBuildings';
import {surfaceHeight} from '../lib/surfaceHeight';
interface Props {viewer:Cesium.Viewer|null;enabled:boolean;quality:string;terrain:boolean;airports:AirportGeometry[];airportStructures:boolean;statusHost:HTMLElement|null;}
export function CityBuildings({viewer:v,enabled,quality,terrain,airports,airportStructures,statusHost}:Props){
 const [status,setStatus]=useState('Zoom into a city to see mapped buildings.');
 useEffect(()=>{
  if(!v||v.isDestroyed()||!enabled)return;
  const C=window.Cesium;
  let worker:Worker;
  try{worker=new Worker(new URL('../workers/cityBuildings.worker.ts',import.meta.url),{type:'module'});}catch{setStatus('3D city buildings are unavailable in this browser.');return;}
  const cache=new Map<string,CityBuilding[]>(),pending=new Set<string>(),failed=new Map<string,number>(),meshes=new Map<string,Cesium.Primitive>(),replacements=new Map<string,Cesium.Primitive>();
  let previous:{lon:number;lat:number;time:number}|null=null;let desired:CityTile[]=[],disposed=false,lastUpdate=0,terrainTimer:ReturnType<typeof setTimeout>|undefined;
  const credit=new C.Credit('<a href="https://openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',true);
  v.creditDisplay.addStaticCredit(credit);
  const exclusions=airportStructures?airports.flatMap(a=>a.surfaces.filter(s=>s.kind!=='apron').map(s=>({minX:Math.min(...s.points.map(p=>p[0])),maxX:Math.max(...s.points.map(p=>p[0])),minY:Math.min(...s.points.map(p=>p[1])),maxY:Math.max(...s.points.map(p=>p[1]))}))):[];
  function clear(){for(const mesh of [...meshes.values(),...replacements.values()])v!.scene.primitives.remove(mesh);meshes.clear();replacements.clear();}
  function draw(key:string,buildings:CityBuilding[],replace=false){
   if(disposed||v!.isDestroyed()||replacements.has(key)||(!replace&&meshes.has(key)))return;
   const instances:Cesium.GeometryInstance[]=[];
   for(const [index,b] of buildings.entries()){
    const ring=b.rings[0];if(!ring?.length)continue;
    const lon=ring.reduce((s,p)=>s+p[0],0)/ring.length,lat=ring.reduce((s,p)=>s+p[1],0)/ring.length;
    if(exclusions.some(e=>lon>=e.minX&&lon<=e.maxX&&lat>=e.minY&&lat<=e.maxY))continue;
    const base=terrain?surfaceHeight(v!.scene.globe.getHeight(C.Cartographic.fromDegrees(lon,lat))):0;
    const hierarchy=new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(ring.flat()),b.rings.slice(1).map(hole=>new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(hole.flat()))));
    instances.push(new C.GeometryInstance({id:`city-building-${key}-${index}`,geometry:new C.PolygonGeometry({polygonHierarchy:hierarchy,height:base+b.base,extrudedHeight:base+b.height,vertexFormat:C.PerInstanceColorAppearance.VERTEX_FORMAT}),attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(b.height>80?'#acb9c0':b.height>25?'#b5b9b7':'#c1bcb0'))}}));
   }
   if(instances.length)(replace&&meshes.has(key)?replacements:meshes).set(key,v!.scene.primitives.add(new C.Primitive({geometryInstances:instances,appearance:new C.PerInstanceColorAppearance({closed:true,translucent:false,flat:false}),asynchronous:true,allowPicking:false})));
   v!.scene.requestRender();
  }
  function pump(){
   if(disposed||v!.isDestroyed())return;
   for(const tile of desired){
    if(cache.has(tile.key)){draw(tile.key,cache.get(tile.key)!);continue;}
    if(pending.size>=2)break;
    if(pending.has(tile.key)||(failed.get(tile.key)??0)>Date.now())continue;
    pending.add(tile.key);worker.postMessage({tile,limit:quality==='low'?250:quality==='high'?1000:600});
   }
   const errors=desired.filter(t=>failed.has(t.key)).length,loaded=desired.filter(t=>cache.has(t.key));
   setStatus(!desired.length?'Zoom closer to see 3D city buildings.':errors?'Some city buildings are unavailable. Retrying shortly.':pending.size?'Loading nearby city buildings…':loaded.some(t=>cache.get(t.key)!.length)?'3D city buildings · mapped footprints; heights may be approximate.':'No mapped buildings in this area.');
  }
  worker.onmessage=(event:MessageEvent<{key:string;buildings?:CityBuilding[];error?:boolean}>)=>{
   const {key,buildings,error}=event.data;pending.delete(key);if(disposed)return;
   if(error)failed.set(key,Date.now()+60000);else{failed.delete(key);cache.set(key,buildings??[]);if(cache.size>24){const old=[...cache.keys()].find(k=>!desired.some(t=>t.key===k));if(old)cache.delete(old);}}
   if(failed.size>64)failed.delete(failed.keys().next().value!);pump();
  };
  worker.onerror=()=>{pending.clear();for(const t of desired)failed.set(t.key,Date.now()+60000);setStatus('3D city buildings unavailable. Toggle the layer to retry.');};
  function update(){
   if(disposed||v!.isDestroyed()||document.hidden)return;
   const now=performance.now();if(now-lastUpdate<1200)return;lastUpdate=now;
   const cam=v!.camera,ground=surfaceHeight(v!.scene.globe.getHeight(cam.positionCartographic));
   if(v!.scene.mode!==C.SceneMode.SCENE3D||cam.positionCartographic.height-ground>18000){desired=[];clear();pump();return;}
   const ray=cam.getPickRay(new C.Cartesian2(v!.canvas.clientWidth/2,v!.canvas.clientHeight*.6));
   const hit=ray?v!.scene.globe.pick(ray,v!.scene):undefined;
   const focus=hit?C.Cartographic.fromCartesian(hit):cam.positionCartographic;
   const lon=C.Math.toDegrees(focus.longitude),lat=C.Math.toDegrees(focus.latitude);
   const current=cityTiles(lon,lat,quality),elapsed=previous?(now-previous.time)/1000:0;
   const dx=previous?((lon-previous.lon+540)%360)-180:0,dy=previous?lat-previous.lat:0;
   // Look 25 seconds ahead while following a flight; don't prefetch after a camera teleport.
   const ahead=elapsed>0&&Math.hypot(dx,dy)<.08?cityTiles(lon+Math.max(-.035,Math.min(.035,dx/elapsed*25)),lat+Math.max(-.035,Math.min(.035,dy/elapsed*25)),quality):[];
   previous={lon,lat,time:now};
   desired=[...new Map([...current,...ahead].map(t=>[t.key,t])).values()];
   const keys=new Set(desired.map(t=>t.key));for(const [key,mesh] of meshes)if(!keys.has(key)){v!.scene.primitives.remove(mesh);meshes.delete(key);const replacement=replacements.get(key);if(replacement){v!.scene.primitives.remove(replacement);replacements.delete(key);}}
   pump();
  }
  const remove=v.camera.moveEnd.addEventListener(update),timer=setInterval(update,1500);
  const terrainRemove=terrain?v.scene.globe.tileLoadProgressEvent.addEventListener((count:number)=>{if(count)return;clearTimeout(terrainTimer);terrainTimer=setTimeout(()=>{if(disposed||v.isDestroyed())return;for(const tile of desired){const buildings=cache.get(tile.key);if(buildings)draw(tile.key,buildings,true);}},1500);}):()=>{};
  // Keep the existing mesh visible while an elevation-adjusted replacement builds.
  const swap=v.scene.postRender.addEventListener(()=>{for(const [key,mesh] of replacements){if(!mesh.ready)continue;const old=meshes.get(key);if(old)v.scene.primitives.remove(old);meshes.set(key,mesh);replacements.delete(key);v.scene.requestRender();}});
  update();
  return()=>{disposed=true;clearInterval(timer);clearTimeout(terrainTimer);remove();terrainRemove();swap();worker.terminate();if(!v.isDestroyed()){clear();v.creditDisplay.removeStaticCredit(credit);v.scene.requestRender();}};
 },[v,enabled,quality,terrain,airports,airportStructures]);
 return enabled&&statusHost?createPortal(<small className="city-buildings-status" role="status">{status}</small>,statusHost):null;
}
