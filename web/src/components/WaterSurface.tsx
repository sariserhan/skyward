import {useEffect,useRef} from 'react';
import type * as Cesium from 'cesium';
import {cityTiles,type CityTile,type CityBuilding} from '../lib/cityBuildings';
import {WATER_SHADER,waterMotion} from '../lib/waterSurface';
import {surfaceHeight} from '../lib/surfaceHeight';
interface Props{viewer:Cesium.Viewer|null;enabled:boolean;quality:string;reduced:boolean;paused?:boolean;satellite?:boolean;}
export function WaterSurface(props:Props){
 const state=useRef(props);state.current=props;
 useEffect(()=>{
  const v=props.viewer;if(!v||v.isDestroyed()||!props.enabled)return;
  const C=window.Cesium;if(!C.GroundPrimitive.supportsMaterials(v.scene))return;
  let worker:Worker;try{worker=new Worker(new URL('../workers/cityBuildings.worker.ts',import.meta.url),{type:'module'});}catch{return;}
  type Water=CityBuilding&{kind?:string};
  const cache=new Map<string,Water[]>(),pending=new Set<string>(),failed=new Map<string,number>(),meshes=new Map<string,Cesium.GroundPrimitive[]>(),materials=new Set<Cesium.Material>();
  let desired:CityTile[]=[],disposed=false,broken=false,clock=0,last=performance.now(),lastFetch=0,focus=C.Cartesian3.ZERO,radius=5000;
  const credit=new C.Credit('<a href="https://openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',true);v.creditDisplay.addStaticCredit(credit);
  function erase(key:string){for(const p of meshes.get(key)??[]){materials.delete((p.appearance as Cesium.MaterialAppearance).material);v!.scene.groundPrimitives.remove(p);}meshes.delete(key);}
  function draw(key:string,rows:Water[]){
   if(meshes.has(key))return;const group:Cesium.GroundPrimitive[]=[];meshes.set(key,group);
   for(const ocean of [true,false]){
    const instances=rows.filter(r=>r.rings[0]?.length>=3&&(r.kind==='ocean')===ocean).map((r,i)=>new C.GeometryInstance({id:`water-surface-${key}-${i}`,geometry:new C.PolygonGeometry({polygonHierarchy:new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(r.rings[0].flat()),r.rings.slice(1).map(h=>new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(h.flat())))),vertexFormat:C.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat})}));
    if(!instances.length)continue;
    const material=new C.Material({fabric:{type:'SkywardWater',uniforms:{waveTime:clock,opacity:.65,waterColor:C.Color.fromCssColorString('#173e4c'),roughness:ocean?1:.5,focusPoint:focus,radius},source:WATER_SHADER},translucent:true});materials.add(material);
    group.push(v!.scene.groundPrimitives.add(new C.GroundPrimitive({geometryInstances:instances,appearance:new C.MaterialAppearance({material,materialSupport:C.MaterialAppearance.MaterialSupport.TEXTURED,translucent:true,faceForward:true}),classificationType:C.ClassificationType.TERRAIN,allowPicking:false,asynchronous:true})));
   }meshes.set(key,group);v!.scene.requestRender();
  }
  function pump(){if(broken||disposed)return;for(const t of desired){if(cache.has(t.key)){draw(t.key,cache.get(t.key)!);continue;}if(pending.size>=2)break;if(pending.has(t.key)||(failed.get(t.key)??0)>Date.now())continue;pending.add(t.key);worker.postMessage({tile:t,limit:300,water:true});}}
  worker.onmessage=(e:MessageEvent<{key:string;buildings?:Water[];error?:boolean}>)=>{if(disposed||v.isDestroyed())return;const {key,buildings,error}=e.data;pending.delete(key);if(error)failed.set(key,Date.now()+60000);else{cache.set(key,buildings??[]);failed.delete(key);}if(cache.size>20){const old=[...cache.keys()].find(k=>!desired.some(t=>t.key===k));if(old)cache.delete(old);}if(failed.size>40)failed.delete(failed.keys().next().value!);pump();};
  worker.onerror=()=>{broken=true;worker.terminate();pending.clear();for(const t of desired)failed.set(t.key,Infinity);};
  const timer=setInterval(()=>{
   if(disposed||v.isDestroyed())return;const now=performance.now(),dt=Math.min(.2,(now-last)/1000);last=now;if(document.hidden)return;
   const p=state.current,ground=surfaceHeight(v.scene.globe.getHeight(v.camera.positionCartographic)),altitude=v.camera.positionCartographic.height-ground;
   if(v.scene.mode!==C.SceneMode.SCENE3D||altitude>25000){desired=[];for(const key of meshes.keys())erase(key);return;}
   if(now-lastFetch>1500){lastFetch=now;const ray=v.camera.getPickRay(new C.Cartesian2(v.canvas.clientWidth*.5,v.canvas.clientHeight*.65)),hit=ray?v.scene.globe.pick(ray,v.scene):undefined;
    if(hit){focus=hit;const c=C.Cartographic.fromCartesian(hit),lat=C.Math.toDegrees(c.latitude),z=altitude<3000?13:12;radius=40075016/2**z*Math.cos(c.latitude)*(p.quality==='low'?.4:.8);desired=cityTiles(C.Math.toDegrees(c.longitude),lat,p.quality,z);const keys=new Set(desired.map(t=>t.key));for(const key of meshes.keys())if(!keys.has(key))erase(key);pump();}
   }
   const animate=waterMotion(p.quality,p.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches,!!p.paused).animated;if(animate)clock+=dt;
   for(const m of materials){m.uniforms.waveTime=clock;m.uniforms.focusPoint=focus;m.uniforms.radius=radius;m.uniforms.opacity=p.satellite?.42:.8;}
   if(materials.size&&animate)v.scene.requestRender();
  },waterMotion(props.quality,false,false).interval);
  return()=>{disposed=true;clearInterval(timer);worker.terminate();if(!v.isDestroyed()){for(const k of meshes.keys())erase(k);v.creditDisplay.removeStaticCredit(credit);v.scene.requestRender();}};
 },[props.viewer,props.enabled,props.quality]);
 return null;
}
