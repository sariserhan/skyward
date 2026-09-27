import {useEffect} from 'react';
import type * as Cesium from 'cesium';
import type {City} from '../lib/cities';
export function CityLabels({viewer,cities,enabled,large}:{viewer:Cesium.Viewer|null;cities:City[];enabled:boolean;large:boolean}){
 useEffect(()=>{
  if(!viewer||!enabled||!cities.length)return;const v=viewer,C=window.Cesium;
  const entries=cities.map((city,i)=>{const position=C.Cartesian3.fromDegrees(city.lon,city.lat,300);return {city,position,e:v.entities.add({id:`city-${i}`,show:false,position,label:{text:`• ${city.name}`,font:`${city.capital?'600':'400'} ${large?17:13}px sans-serif`,fillColor:C.Color.fromCssColorString('#fff2d2'),style:C.LabelStyle.FILL_AND_OUTLINE,outlineColor:C.Color.fromCssColorString('#15252c'),outlineWidth:4,disableDepthTestDistance:100000,horizontalOrigin:C.HorizontalOrigin.LEFT,pixelOffset:new C.Cartesian2(5,0)}})};});
  let last=0;
  const update=()=>{
   const now=performance.now();if(now-last<250)return;last=now;
   const h=v.camera.positionCartographic.height;const maxRank=h>7000000?2:h>2500000?4:h>800000?6:10;
   const boxes:{x:number;y:number;w:number}[]=[];
   for(const e of v.entities.values){if(!e.show||!e.id.startsWith('atlas-country-')||!e.position||!e.label)continue;const position=e.position.getValue(v.clock.currentTime);if(!position)continue;const point=C.SceneTransforms.worldToWindowCoordinates(v.scene,position);if(point){const w=String(e.label.text?.getValue(v.clock.currentTime)??'').length*(large?8.5:6.5);boxes.push({x:point.x-w/2,y:point.y,w});}}
   for(const {city,position,e} of entries){
    let visible=false;
    if(city.rank<=maxRank&&(v.scene.mode!==C.SceneMode.SCENE3D||C.Cartesian3.dot(v.scene.globe.ellipsoid.geodeticSurfaceNormal(position),C.Cartesian3.subtract(v.camera.positionWC,position,new C.Cartesian3()))>0)){
     const pt=C.SceneTransforms.worldToWindowCoordinates(v.scene,position),w=city.name.length*(large?9:7)+18;
     if(pt&&pt.x>=10&&pt.y>=12&&pt.x+w<v.canvas.clientWidth-10&&pt.y<v.canvas.clientHeight-35&&boxes.length<65&&!boxes.some(b=>Math.abs(b.y-pt.y)<26&&pt.x<b.x+b.w+14&&pt.x+w+14>b.x)){visible=true;boxes.push({x:pt.x,y:pt.y,w});}
    }
    e.show=visible;
   }
  };
  const remove=v.scene.preRender.addEventListener(update);update();v.scene.requestRender();
  return()=>{remove();if(!v.isDestroyed()){entries.forEach(({e})=>v.entities.remove(e));v.scene.requestRender();}};
 },[viewer,cities,enabled,large]);
 return null;
}
