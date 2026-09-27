import {useEffect,useState} from 'react';
import type * as Cesium from 'cesium';
import {createAtlasProvider,type AtlasData} from '../lib/atlas';
let stored:AtlasData|undefined;
export function AtlasLayer({viewer,active,labels,large}:{viewer:Cesium.Viewer|null;active:boolean;labels:boolean;large:boolean}){
 const [error,setError]=useState(false),[attempt,retry]=useState(0),[loading,setLoading]=useState(false);
 useEffect(()=>{
  if(!viewer||!active)return;const v=viewer,C=window.Cesium,abort=new AbortController();let alive=true,layer:Cesium.ImageryLayer|undefined,dispose=()=>{};const added:Cesium.Entity[]=[];let remove=()=>{};
  setLoading(true);setError(false);
  const install=async()=>{
   const data=stored??await fetch(`${import.meta.env.BASE_URL}data/atlas-v2.json`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])}).then(r=>{if(!r.ok)throw new Error('Atlas unavailable');return r.json() as Promise<AtlasData>;});
   if(!alive||v.isDestroyed())return;if(!data||!Array.isArray(data.land)||!Array.isArray(data.lakes)||!Array.isArray(data.rivers)||!Array.isArray(data.labels))throw new Error('Invalid atlas data');stored=data;
   const atlas=createAtlasProvider(data);dispose=atlas.dispose;layer=v.imageryLayers.addImageryProvider(atlas.provider,0);
   if(labels){
    const entries=data.labels.sort((a,b)=>a.rank-b.rank).map((country,i)=>{const position=C.Cartesian3.fromDegrees(country.lon,country.lat,1000);const e=v.entities.add({id:`atlas-country-${i}`,show:false,position,label:{text:country.name.replace('United States of America','United States').toUpperCase(),font:`500 ${large?15:11}px sans-serif`,fillColor:C.Color.fromCssColorString('#d7e5d8'),style:C.LabelStyle.FILL_AND_OUTLINE,outlineColor:C.Color.fromCssColorString('#233f45'),outlineWidth:3,horizontalOrigin:C.HorizontalOrigin.CENTER}});added.push(e);return {country,position,e};});
    let last=0;
    remove=v.scene.preRender.addEventListener(()=>{const now=performance.now();if(now-last<250)return;last=now;const height=v.camera.positionCartographic.height,rects:{x:number;y:number;w:number}[]=[];
     for(const {country,position,e} of entries){let show=false;
      if(height>180000&&country.rank<=(height>5000000?3:height>1800000?4:7)&&(v.scene.mode!==C.SceneMode.SCENE3D||C.Cartesian3.dot(v.scene.globe.ellipsoid.geodeticSurfaceNormal(position),C.Cartesian3.subtract(v.camera.positionWC,position,new C.Cartesian3()))>0)){
       const p=C.SceneTransforms.worldToWindowCoordinates(v.scene,position),w=country.name.length*(large?8.5:6.5);if(p&&p.x>w/2&&p.x<v.canvas.clientWidth-w/2&&p.y>15&&p.y<v.canvas.clientHeight-35&&!rects.some(r=>Math.abs(r.y-p.y)<32&&Math.abs(r.x-p.x)<(r.w+w)/2+20)){show=true;rects.push({x:p.x,y:p.y,w});}
      }e.show=show;
     }
    });
   }
   setLoading(false);v.scene.requestRender();
  };
  void install().catch(()=>{if(alive){setLoading(false);setError(true);}});
  return()=>{alive=false;abort.abort();remove();dispose();if(!v.isDestroyed()){if(layer&&v.imageryLayers.contains(layer))v.imageryLayers.remove(layer,true);added.forEach(e=>v.entities.remove(e));v.scene.requestRender();}};
 },[viewer,active,labels,large,attempt]);
 if(!active)return null;
 return <div className="atlas-key" aria-label="Atlas legend">{error?<span>Atlas detail unavailable · basic map shown <button onClick={()=>retry(n=>n+1)}>Retry</button></span>:loading?<span>Loading atlas geography…</span>:<><span><i className="atlas-land"/>Land & borders</span><span><i className="atlas-water"/>Lakes & rivers</span><small>Regional reference · airport detail where mapped</small></>}</div>;
}
