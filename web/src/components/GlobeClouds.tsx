import {useEffect,useRef} from 'react';
import type * as Cesium from 'cesium';
import type {WeatherReport} from '../lib/localWeather';

// A globe-scale cover field, restricted to the vicinity of reporting stations.
// Fine-scale cloud texture is illustrative; it is not satellite imagery.
function cloudTexture(reports:WeatherReport[],lowQuality:boolean){
 const canvas=document.createElement('canvas');canvas.width=lowQuality?1024:2048;canvas.height=canvas.width/2;
 const ctx=canvas.getContext('2d');if(!ctx)return null;const w=canvas.width,h=canvas.height;
 for(const r of reports){if(Date.now()-r.observedAt>7200000||r.observedAt-Date.now()>300000)continue;
  const density=Math.max(0,...r.clouds.map(c=>({FEW:.24,SCT:.5,BKN:.8,OVC:1,VV:1}[c.cover]??0)));if(!density)continue;
  const x=(r.lon+180)/360*w,y=(90-r.lat)/180*h,ry=1.3/180*h,rx=ry/Math.max(.15,Math.cos(r.lat*Math.PI/180));
  // Wrap at the dateline. A ~145 km support radius avoids painting unknown oceans.
  for(const offset of [-w,0,w]){ctx.save();ctx.translate(x+offset,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,.12,0,0,1);g.addColorStop(0,`rgba(255,255,255,${density})`);g.addColorStop(.55,`rgba(255,255,255,${density*.8})`);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
 }
 const pixels=ctx.getImageData(0,0,w,h),a=pixels.data;
 const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
 const noise=(x:number,y:number,scale:number)=>{const ix=Math.floor(x/scale),iy=Math.floor(y/scale),u=x/scale-ix,v=y/scale-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),period=w/scale;return (hash(ix%period,iy)*(1-s)+hash((ix+1)%period,iy)*s)*(1-t)+(hash(ix%period,iy+1)*(1-s)+hash((ix+1)%period,iy+1)*s)*t;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!a[i+3])continue;const n=noise(x,y,4)*.5+noise(x,y,16)*.3+noise(x,y,64)*.2,cover=a[i+3]/255,body=Math.max(0,Math.min(1,(cover-.12)*(.3+n*1.7)-.1));a[i]=195+n*60;a[i+1]=205+n*50;a[i+2]=218+n*37;a[i+3]=Math.round(body*225);}
 ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}
export function GlobeClouds({viewer,enabled,lowQuality}:{viewer:Cesium.Viewer;enabled:boolean;lowQuality?:boolean}){
 const settings=useRef({enabled,lowQuality});settings.current={enabled,lowQuality};
 useEffect(()=>{if(viewer.isDestroyed())return;const C=window.Cesium;let disposed=false,layer:Cesium.ImageryLayer|undefined,last=0,validUntil=0;const abort=new AbortController();
 const poll=async()=>{if(document.hidden)return;try{const response=await fetch('/api/weather-overview',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});if(!response.ok)return;const data=await response.json();if(disposed||!Array.isArray(data.reports))return;const fresh=data.reports.filter((r:WeatherReport)=>Date.now()-r.observedAt<=7200000&&r.observedAt-Date.now()<=300000);const expires=Math.min(Date.now()+600000,...fresh.map((r:WeatherReport)=>r.observedAt+7200000));const texture=cloudTexture(fresh,!!settings.current.lowQuality);if(!texture)return;
 const provider=await C.SingleTileImageryProvider.fromUrl(texture,{rectangle:C.Rectangle.MAX_VALUE});if(disposed||viewer.isDestroyed())return;
 const next=viewer.imageryLayers.addImageryProvider(provider);next.show=false;if(layer)viewer.imageryLayers.remove(layer,true);layer=next;validUntil=expires;viewer.scene.requestRender();
 }catch{/* Local weather remains independent of overview availability. */}};
 void poll();const visible=()=>{if(!document.hidden&&Date.now()>=validUntil)void poll();};document.addEventListener('visibilitychange',visible);const timer=setInterval(()=>void poll(),600000);
 const remove=viewer.scene.preRender.addEventListener(()=>{if(performance.now()-last<100||!layer)return;last=performance.now();const height=viewer.camera.positionCartographic.height;layer.show=settings.current.enabled&&Date.now()<validUntil&&height>80000&&viewer.scene.mode===C.SceneMode.SCENE3D;if(layer.show&&viewer.imageryLayers.indexOf(layer)!==viewer.imageryLayers.length-1)viewer.imageryLayers.raiseToTop(layer);layer.alpha=Math.min(.9,Math.max(0,(height-80000)/120000));});
 return()=>{disposed=true;abort.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);remove();if(!viewer.isDestroyed()&&layer)viewer.imageryLayers.remove(layer,true);};
 },[viewer]);
 useEffect(()=>{if(!viewer.isDestroyed())viewer.scene.requestRender();},[viewer,enabled]);return null;
}
