import {publishNearbyFeatures} from '../lib/nearbyFeatures';
import type {NearbyFeature} from '../lib/placeLabels';
import {readFlightPreferences} from '../lib/flightPreferences';
import {cityTiles} from '../lib/cityBuildings';
import {sharedLiveMotion} from '../lib/liveMotion';
import {useEffect,useMemo,useState} from 'react';
import type * as Cesium from 'cesium';
import type {City} from '../lib/cities';
export function CityLabels({viewer,cities,enabled,large,flight=false,aircraftHex}:{viewer:Cesium.Viewer|null;cities:City[];enabled:boolean;large:boolean;flight?:boolean;aircraftHex?:string}){
 const [local,setLocal]=useState<City[]>([]);
 useEffect(()=>{
  setLocal([]);if(!viewer||!enabled||!flight)return;const v=viewer,C=window.Cesium;
  let worker:Worker;try{worker=new Worker(new URL('../workers/cityBuildings.worker.ts',import.meta.url),{type:'module'});}catch{return;}
  let disposed=false,desired:string[]=[],lastKey='',flush:ReturnType<typeof setTimeout>|undefined;
  const cache=new Map<string,City[]>(),pending=new Set<string>(),failed=new Map<string,number>();
  const publish=()=>{clearTimeout(flush);flush=setTimeout(()=>{if(!disposed)setLocal(desired.flatMap(key=>cache.get(key)??[]));},200);};
  const update=()=>{
   if(v.isDestroyed()||document.hidden)return;
   const picked=v.camera.pickEllipsoid(new C.Cartesian2(v.canvas.clientWidth*.5,v.canvas.clientHeight*.65),v.scene.globe.ellipsoid);
   const frame=aircraftHex?sharedLiveMotion.displayed(aircraftHex):null;
   const center=picked?C.Cartographic.fromCartesian(picked):frame?C.Cartographic.fromDegrees(frame.lon,frame.lat):v.camera.positionCartographic;
   const tiles=cityTiles(C.Math.toDegrees(center.longitude),C.Math.toDegrees(center.latitude),'low',9),key=tiles.map(t=>t.key).join('|');desired=tiles.map(t=>t.key);
   if(key!==lastKey){lastKey=key;publishNearbyFeatures(desired.flatMap(k=>features.get(k)??[]));publish();}
   for(const tile of tiles)if(pending.size<4&&!cache.has(tile.key)&&!pending.has(tile.key)&&(failed.get(tile.key)??0)<Date.now()){pending.add(tile.key);worker.postMessage({tile,limit:150,places:true});}
  };
  const features=new Map<string,NearbyFeature[]>();
  worker.onmessage=event=>{const {key,places,error}=event.data;pending.delete(key);if(error){failed.set(key,Date.now()+60000);if(failed.size>32)failed.delete(failed.keys().next().value!);return;}if(!Array.isArray(places))return;features.set(key,event.data.features??[]);while(features.size>32)features.delete(features.keys().next().value!);publishNearbyFeatures(desired.flatMap(k=>features.get(k)??[]));cache.set(key,places);while(cache.size>32)cache.delete(cache.keys().next().value!);if(desired.includes(key))publish();};
  const credit=new C.Credit('<a href="https://openmaptiles.org/">Place labels: OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',false);v.creditDisplay.addStaticCredit(credit);
  update();const timer=setInterval(update,2000);
  return()=>{disposed=true;clearInterval(timer);clearTimeout(flush);worker.terminate();if(!v.isDestroyed())v.creditDisplay.removeStaticCredit(credit);};
 },[viewer,enabled,flight,aircraftHex]);
 const places=useMemo(()=>{const names=new Set<string>();return [...local,...cities].filter(c=>{const key=`${c.name.toLowerCase()}:${c.lon.toFixed(1)}:${c.lat.toFixed(1)}`;if(names.has(key))return false;names.add(key);return true;});},[cities,local]);
 useEffect(()=>{
  if(!viewer||!enabled||!places.length)return;const v=viewer,C=window.Cesium;
  const entries=places.map((city,i)=>{const position=C.Cartesian3.fromDegrees(city.lon,city.lat,40);return {city,position,e:v.entities.add({id:`city-${i}`,show:false,position,label:{text:`• ${city.name}`,font:`${city.capital?'600':'400'} ${large?17:13}px sans-serif`,fillColor:C.Color.fromCssColorString('#fff2d2'),style:C.LabelStyle.FILL_AND_OUTLINE,outlineColor:C.Color.fromCssColorString('#15252c'),outlineWidth:4,heightReference:C.HeightReference.RELATIVE_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY,horizontalOrigin:C.HorizontalOrigin.LEFT,pixelOffset:new C.Cartesian2(5,0)}})};});
  let last=0;
  const update=()=>{
   const now=performance.now();if(now-last<250)return;last=now;
   const h=v.camera.positionCartographic.height;const maxRank=flight?10:h>7000000?2:h>2500000?4:h>800000?6:10;
   const density=readFlightPreferences().labelDensity;const boxes:{x:number;y:number;w:number}[]=[];
   for(const e of v.entities.values){if(!e.show||!e.id.startsWith('atlas-country-')||!e.position||!e.label)continue;const position=e.position.getValue(v.clock.currentTime);if(!position)continue;const point=C.SceneTransforms.worldToWindowCoordinates(v.scene,position);if(point){const w=String(e.label.text?.getValue(v.clock.currentTime)??'').length*(large?8.5:6.5);boxes.push({x:point.x-w/2,y:point.y,w});}}
   for(const {city,position:base,e} of entries){
    const position=flight?C.Cartesian3.fromDegrees(city.lon,city.lat,(v.scene.globe.getHeight(C.Cartographic.fromDegrees(city.lon,city.lat))??0)+40):base;
    let visible=false;
    if(city.rank<=maxRank&&(v.scene.mode!==C.SceneMode.SCENE3D||(C.Cartesian3.dot(v.camera.directionWC,C.Cartesian3.subtract(position,v.camera.positionWC,new C.Cartesian3()))>0&&C.Cartesian3.dot(v.scene.globe.ellipsoid.geodeticSurfaceNormal(position),C.Cartesian3.subtract(v.camera.positionWC,position,new C.Cartesian3()))>0))){
     const pt=C.SceneTransforms.worldToWindowCoordinates(v.scene,position),w=city.name.length*(large?9:7)+18;
     if(pt&&pt.x>=10&&pt.y>=12&&pt.x+w<v.canvas.clientWidth-10&&pt.y<v.canvas.clientHeight-35&&boxes.length<(flight?(density==='sparse'?8:density==='rich'?40:24):65)&&!boxes.some(b=>Math.abs(b.y-pt.y)<26&&pt.x<b.x+b.w+14&&pt.x+w+14>b.x)){visible=true;boxes.push({x:pt.x,y:pt.y,w});}
    }
    e.show=visible;
   }
  };
  const remove=v.scene.preRender.addEventListener(update);update();v.scene.requestRender();
  return()=>{remove();if(!v.isDestroyed()){entries.forEach(({e})=>v.entities.remove(e));v.scene.requestRender();}};
 },[viewer,places,enabled,large,flight]);
 return null;
}
