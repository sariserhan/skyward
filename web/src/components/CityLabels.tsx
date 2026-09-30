import {retainPlaceLabels,PlaceLabelVisibility} from '../lib/stablePlaceLabels';
import {overlapsAircraft,type ScreenBox} from '../lib/labelPriority';
import {publishNearbyFeatures} from '../lib/nearbyFeatures';
import {placeLabelZoom,type NearbyFeature} from '../lib/placeLabels';
import {readFlightPreferences} from '../lib/flightPreferences';
import {cityTiles} from '../lib/cityBuildings';
import {sharedLiveMotion} from '../lib/liveMotion';
import {useEffect,useMemo,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import type {City} from '../lib/cities';
export function CityLabels({viewer,cities,enabled,large,flight=false,aircraftHex}:{viewer:Cesium.Viewer|null;cities:City[];enabled:boolean;large:boolean;flight?:boolean;aircraftHex?:string}){
 const [local,setLocal]=useState<City[]>([]);
 useEffect(()=>{
  setLocal([]);if(!viewer||!enabled||!flight)return;const v=viewer,C=window.Cesium;
  let worker:Worker;try{worker=new Worker(new URL('../workers/cityBuildings.worker.ts',import.meta.url),{type:'module'});}catch{return;}
  let disposed=false,desired:string[]=[],lastKey='',flush:ReturnType<typeof setTimeout>|undefined;
  const cache=new Map<string,City[]>(),pending=new Set<string>(),failed=new Map<string,number>();
  const publish=()=>{clearTimeout(flush);flush=setTimeout(()=>{if(!disposed)setLocal(previous=>retainPlaceLabels(previous,desired.flatMap(key=>cache.get(key)??[])));},200);};
  const update=()=>{
   if(v.isDestroyed()||document.hidden)return;
   const picked=v.camera.pickEllipsoid(new C.Cartesian2(v.canvas.clientWidth*.5,v.canvas.clientHeight*.65),v.scene.globe.ellipsoid);
   const frame=aircraftHex?sharedLiveMotion.displayed(aircraftHex):null;
   const entityPosition=aircraftHex?v.entities.getById(`aircraft-${aircraftHex}`)?.position?.getValue(v.clock.currentTime):undefined;
   const center=entityPosition?C.Cartographic.fromCartesian(entityPosition):frame?C.Cartographic.fromDegrees(frame.lon,frame.lat):picked?C.Cartographic.fromCartesian(picked):v.camera.positionCartographic;
   const tiles=cityTiles(C.Math.toDegrees(center.longitude),C.Math.toDegrees(center.latitude),'balanced',placeLabelZoom(v.camera.positionCartographic.height)),key=tiles.map(t=>t.key).join('|');desired=tiles.map(t=>t.key);
   if(key!==lastKey){lastKey=key;publishNearbyFeatures(desired.flatMap(k=>features.get(k)??[]));publish();}
   for(const tile of tiles)if(pending.size<4&&!cache.has(tile.key)&&!pending.has(tile.key)&&(failed.get(tile.key)??0)<Date.now()){pending.add(tile.key);worker.postMessage({tile,limit:150,places:true});}
  };
  const features=new Map<string,NearbyFeature[]>();
  worker.onmessage=event=>{const {key,places,error}=event.data;pending.delete(key);if(error){failed.set(key,Date.now()+60000);if(failed.size>32)failed.delete(failed.keys().next().value!);return;}if(!Array.isArray(places))return;features.set(key,event.data.features??[]);while(features.size>32)features.delete(features.keys().next().value!);publishNearbyFeatures(desired.flatMap(k=>features.get(k)??[]));cache.set(key,places);while(cache.size>32)cache.delete(cache.keys().next().value!);if(desired.includes(key))publish();};
  const credit=new C.Credit('<a href="https://openmaptiles.org/">Place labels: OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',false);v.creditDisplay.addStaticCredit(credit);
  update();const timer=setInterval(update,2000);
  return()=>{disposed=true;clearInterval(timer);clearTimeout(flush);worker.terminate();if(!v.isDestroyed())v.creditDisplay.removeStaticCredit(credit);};
 },[viewer,enabled,flight,aircraftHex]);
 const places=useMemo(()=>{const names=new Set<string>();return [...cities,...local].filter(c=>{const key=`${c.name.toLowerCase()}:${c.lon.toFixed(1)}:${c.lat.toFixed(1)}`;if(names.has(key))return false;names.add(key);return true;});},[cities,local]);
 const latestPlaces=useRef(places);latestPlaces.current=places;
 useEffect(()=>{if(viewer&&!viewer.isDestroyed())viewer.scene.requestRender();},[viewer,places]);
 useEffect(()=>{
  if(!viewer||!enabled)return;const v=viewer,C=window.Cesium;
  const makeEntry=(city:City,key:string)=>{const position=C.Cartesian3.fromDegrees(city.lon,city.lat,40);return {visibility:new PlaceLabelVisibility(),city,position,cartographic:C.Cartographic.fromDegrees(city.lon,city.lat),normal:v.scene.globe.ellipsoid.geodeticSurfaceNormal(position),e:v.entities.add({id:`city-${key}`,show:false,position,label:{text:`• ${city.name}`,font:`${city.capital?'600':'400'} ${large?17:13}px sans-serif`,fillColor:C.Color.fromCssColorString('#fff2d2'),style:C.LabelStyle.FILL_AND_OUTLINE,outlineColor:C.Color.fromCssColorString('#15252c'),outlineWidth:4,heightReference:flight?C.HeightReference.NONE:C.HeightReference.RELATIVE_TO_GROUND,disableDepthTestDistance:flight?Number.POSITIVE_INFINITY:0,horizontalOrigin:C.HorizontalOrigin.LEFT,pixelOffset:new C.Cartesian2(5,0)}})};};
  const entries=new Map<string,ReturnType<typeof makeEntry>>();let activePlaces:City[]|null=null,orderedEntries:ReturnType<typeof makeEntry>[]=[];
  let last=0;const delta=new C.Cartesian3();
  const update=()=>{
   const now=performance.now();if(activePlaces===latestPlaces.current&&now-last<250)return;last=now;
   // Tile arrivals preserve existing labels and their terrain/GPU registrations.
   if(activePlaces!==latestPlaces.current){
    activePlaces=latestPlaces.current;const keep=new Set<string>(),ordered:ReturnType<typeof makeEntry>[]=[];
    for(const city of activePlaces){const key=JSON.stringify([city.name,city.lon,city.lat,city.rank,city.capital]);keep.add(key);if(!entries.has(key))entries.set(key,makeEntry(city,key));ordered.push(entries.get(key)!);}
    for(const [key,entry] of entries)if(!keep.has(key)){v.entities.remove(entry.e);entries.delete(key);}
    orderedEntries=ordered;
   }
   const h=v.camera.positionCartographic.height;const maxRank=flight?10:h>7000000?2:h>2500000?4:h>800000?6:10;
   // Reserve screen space for aircraft models and markers before placing text.
   // Flight annotations bypass terrain depth, but never aircraft exclusion.
   const aircraftBoxes:ScreenBox[]=[],modelBounds=new Map<string,Cesium.BoundingSphere>();
   for(let i=0;i<v.scene.primitives.length;i++){const primitive=v.scene.primitives.get(i);if(primitive instanceof C.Model&&primitive.ready&&primitive.show&&primitive.id instanceof C.Entity)modelBounds.set(primitive.id.id,primitive.boundingSphere);}
   for(const aircraft of v.entities.values){
    if(!aircraft.isShowing||!(aircraft.id.startsWith('aircraft-')||aircraft.id==='flight-simulation')||!aircraft.position)continue;
    const position=aircraft.position.getValue(v.clock.currentTime);if(!position)continue;
    if(v.scene.mode===C.SceneMode.SCENE3D&&C.Cartesian3.dot(v.camera.directionWC,C.Cartesian3.subtract(position,v.camera.positionWC,new C.Cartesian3()))<=0)continue;
    let center=position,radius=24;
    const sphere=modelBounds.get(aircraft.id);
    if(sphere&&C.Cartesian3.distance(v.camera.positionWC,sphere.center)>sphere.radius*1.1){
     center=sphere.center;const pixels=v.camera.getPixelSize(sphere,v.canvas.clientWidth,v.canvas.clientHeight);
     if(Number.isFinite(pixels)&&pixels>0)radius=Math.max(radius,sphere.radius/pixels+12);
    }
    const pt=C.SceneTransforms.worldToWindowCoordinates(v.scene,center);if(!pt||!Number.isFinite(radius)||!Number.isFinite(pt.x+pt.y))continue;
    aircraftBoxes.push({x:pt.x-radius,y:pt.y-radius,width:radius*2,height:radius*2});
   }
   const density=readFlightPreferences().labelDensity;const boxes:{x:number;y:number;w:number}[]=[];
   for(const e of v.entities.values){if(!e.show||!e.id.startsWith('atlas-country-')||!e.position||!e.label)continue;const position=e.position.getValue(v.clock.currentTime);if(!position)continue;const point=C.SceneTransforms.worldToWindowCoordinates(v.scene,position);if(point){const w=String(e.label.text?.getValue(v.clock.currentTime)??'').length*(large?8.5:6.5);if(point.x+w/2>0&&point.x-w/2<v.canvas.clientWidth&&point.y>=0&&point.y<v.canvas.clientHeight)boxes.push({x:point.x-w/2,y:point.y,w});}}
   const limit=flight?(density==='sparse'?8:density==='rich'?40:24):65;
   // Keep incumbents ahead of newly loaded labels so tile completion cannot evict them.
   orderedEntries.sort((a,b)=>Number(b.e.show)-Number(a.e.show)||a.city.rank-b.city.rank);
   for(const {city,position:base,cartographic,normal,e,visibility} of orderedEntries){
    // Reject labels that cannot be drawn before querying terrain. The conservative
    // 9km margin preserves mountains and below-sea-level scenery near the horizon.
    if(city.rank>maxRank||boxes.length>=limit){e.show=visibility.update(false,now);continue;}
    if(v.scene.mode===C.SceneMode.SCENE3D){
     C.Cartesian3.subtract(base,v.camera.positionWC,delta);
     if(C.Cartesian3.dot(v.camera.directionWC,delta)<-9000||C.Cartesian3.dot(normal,delta)>9000){e.show=visibility.update(false,now);continue;}
    }
    const position=flight?C.Cartesian3.fromRadians(cartographic.longitude,cartographic.latitude,(v.scene.globe.getHeight(cartographic)??0)+40):base;
    let visible=false;
    if(city.rank<=maxRank&&(v.scene.mode!==C.SceneMode.SCENE3D||(C.Cartesian3.dot(v.camera.directionWC,C.Cartesian3.subtract(position,v.camera.positionWC,new C.Cartesian3()))>0&&C.Cartesian3.dot(v.scene.globe.ellipsoid.geodeticSurfaceNormal(position),C.Cartesian3.subtract(v.camera.positionWC,position,new C.Cartesian3()))>0))){
     const pt=C.SceneTransforms.worldToWindowCoordinates(v.scene,position),w=city.name.length*(large?9:7)+18;
     if(pt&&!overlapsAircraft({x:pt.x,y:pt.y-14,width:w+10,height:28},aircraftBoxes)&&pt.x>=10&&pt.y>=12&&pt.x+w<v.canvas.clientWidth-10&&pt.y<v.canvas.clientHeight-35&&boxes.length<limit&&!boxes.some(b=>Math.abs(b.y-pt.y)<26&&pt.x<b.x+b.w+14&&pt.x+w+14>b.x)){visible=true;boxes.push({x:pt.x,y:pt.y,w});}
    }
    // Use the same terrain-adjusted position for visibility and drawing. Flight
    // labels are map annotations; keep them readable over terrain, with aircraft
    // exclusion above handling priority instead of terrain depth testing.
    if(visible&&flight){const current=e.position?.getValue(v.clock.currentTime);if(!current||!C.Cartesian3.equalsEpsilon(current,position,0,.5)){if(e.position instanceof C.ConstantPositionProperty)e.position.setValue(position);else e.position=new C.ConstantPositionProperty(position);}}
    e.show=visibility.update(visible,now);
   }
  };
  const remove=v.scene.preRender.addEventListener(update);update();v.scene.requestRender();
  return()=>{remove();if(!v.isDestroyed()){entries.forEach(({e})=>v.entities.remove(e));v.scene.requestRender();}};
 },[viewer,enabled,large,flight]);
 return null;
}
