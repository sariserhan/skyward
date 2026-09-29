import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type * as Cesium from 'cesium';
import {reportDistanceKm,altitudeWeather,cloudThickness,weatherSummary,type LocalWeather,type WeatherFocus,type WeatherReport} from '../lib/localWeather';
import type {SimWeather} from '../lib/simulatorWeather';
import {solarElevation,sunDirectionFixed} from '../lib/solarLighting';
import './weather-layer.css';
interface Props {viewer:Cesium.Viewer|null;enabled:boolean;focus:()=>WeatherFocus|null;manual?:()=>SimWeather|undefined;onReport?:(r:WeatherReport|null)=>void;statusHost?:HTMLElement|null;reduced?:boolean;lowQuality?:boolean;}
const hash=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const cover=(s:string)=>({FEW:.2,SCT:.5,BKN:.8,OVC:1,VV:1}[s]??.4);
function manualReport(w:SimWeather,f:WeatherFocus):WeatherReport{return {station:'Manual',lat:f.lat,lon:f.lon,elevationM:f.datumM??0,observedAt:Date.now(),distanceKm:0,raw:'Manual simulator weather',clouds:w.rain?[{cover:'OVC',baseM:(f.datumM??0)+900}]:[],cloudsKnown:true,rain:w.rain,snow:0,hail:false,storm:false,fog:w.visibility<3,visibilityKm:w.visibility,temperatureC:null,windDirection:w.direction,windKnots:w.wind,gustKnots:w.wind+w.gusts};}
export function WeatherLayer(props:Props){
 const latest=useRef(props);latest.current=props;const report=useRef<WeatherReport|null>(null),[data,setData]=useState<LocalWeather|null>(null),[focused,setFocused]=useState(false),[effects,setEffects]=useState(()=>{try{return localStorage.getItem('skyward.weather.effects')!=='off';}catch{return true;}}),[lightning,setLightning]=useState(true),effectsRef=useRef(effects),lightningRef=useRef(lightning);effectsRef.current=effects;lightningRef.current=lightning;
 useEffect(()=>{try{localStorage.setItem('skyward.weather.effects',effects?'on':'off');}catch{}},[effects]);
 useEffect(()=>{if(props.viewer&&!props.viewer.isDestroyed())props.viewer.scene.requestRender();},[props.viewer,effects,lightning,data]);
 useEffect(()=>{if(!props.viewer||!props.enabled){report.current=null;latest.current.onReport?.(null);return;}let disposed=false,busy=false,lastKey='',lastFetch=0;const abort=new AbortController();
  const poll=async()=>{if(disposed||busy||document.hidden)return;const p=latest.current,f=p.focus();setFocused(!!f);if(!f){report.current=null;p.onReport?.(null);lastKey='';return;}const manual=p.manual?.();if(manual){report.current=manualReport(manual,f);setData({status:'current',fetchedAt:Date.now(),report:report.current});p.onReport?.(null);lastKey='';return;}
   const key=`${Math.round(f.lat*4)},${Math.round(f.lon*4)}`;if(key===lastKey&&Date.now()-lastFetch<600000)return;if(key!==lastKey){report.current=null;p.onReport?.(null);}busy=true;lastKey=key;lastFetch=Date.now();try{const r=await fetch(`/api/local-weather?lat=${f.lat.toFixed(4)}&lon=${f.lon.toFixed(4)}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});if(!r.ok)throw Error();const value=await r.json() as LocalWeather;if(!disposed){const current=latest.current.focus();if(!current||value.report&&reportDistanceKm(value.report,current)>150){report.current=null;p.onReport?.(null);lastKey='';return;}report.current=value.report;setData(value);p.onReport?.(value.report);}}catch{if(!disposed){report.current=null;setData({status:'unavailable',report:null,fetchedAt:null});p.onReport?.(null);lastFetch=Date.now()-570000;}}finally{busy=false;}};
  void poll();const timer=setInterval(()=>void poll(),15000);return()=>{disposed=true;abort.abort();clearInterval(timer);report.current=null;};
 },[props.viewer,props.enabled,props.manual]);
 useEffect(()=>{const v=props.viewer;if(!v||!props.enabled||v.isDestroyed())return;const C=window.Cesium,clouds=v.scene.primitives.add(new C.CloudCollection({noiseDetail:16}));
  const canvas=document.createElement('canvas');canvas.className='weather-particles';canvas.setAttribute('aria-hidden','true');v.container.appendChild(canvas);const ctx=canvas.getContext('2d');if(!ctx){v.scene.primitives.remove(clouds);canvas.remove();return;}
  let last=0,cloudKey='',lastCloud=0,width=0,height=0,flashUntil=0,nextFlash=performance.now()+20000;const particles=Array.from({length:240},(_,i)=>({x:hash(i+1),y:hash(i+300),depth:.2+hash(i+700)*.8}));
  const fog={enabled:v.scene.fog.enabled,density:v.scene.fog.density,minimumBrightness:v.scene.fog.minimumBrightness};let changedFog=false;
  const restore=()=>{if(changedFog){Object.assign(v.scene.fog,fog);changedFog=false;}};
  const remove=v.scene.preRender.addEventListener(()=>{const now=performance.now();if(now-last<(latest.current.lowQuality?65:32))return;const dt=Math.min(.06,(now-last)/1000||.033);last=now;
   const p=latest.current,f=p.focus(),manual=f?p.manual?.():null,r=manual&&f?manualReport(manual,f):report.current,reduced=p.reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const w=v.canvas.clientWidth,h=v.canvas.clientHeight;if(w!==width||h!==height){width=w;height=h;canvas.width=w;canvas.height=h;}ctx.clearRect(0,0,width,height);
   if(!effectsRef.current||!f||!r||reportDistanceKm(r,f)>150||Date.now()-r.observedAt>7200000||document.hidden||v.scene.mode!==C.SceneMode.SCENE3D){clouds.show=false;restore();return;}clouds.show=true;
   const datum=f.datumM??0,eyeAltitude=v.camera.positionCartographic.height+datum,conditions=altitudeWeather(r,eyeAltitude),cos=Math.max(.3,Math.cos(f.lat*Math.PI/180)),lonStep=.045/cos,gx=Math.floor(f.lon/lonStep),gy=Math.floor(f.lat/.045),key=`${r.station}:${manual?'manual':r.observedAt}:${gx}:${gy}:${datum}:${r.rain}:${r.clouds.length}:${Math.floor(Date.now()/300000)}`;
   if(now-lastCloud>1000&&key!==cloudKey){cloudKey=key;lastCloud=now;clouds.removeAll();const thickness=cloudThickness(r),radius=p.lowQuality?1:2,sun=sunDirectionFixed(C,v.clock.currentTime),elevation=solarElevation(C,C.Cartesian3.fromDegrees(f.lon,f.lat),sun),night=v.scene.globe.enableLighting&&elevation< -3;
    for(const [level,layer] of r.clouds.slice(0,3).entries())for(let y=gy-radius;y<=gy+radius;y++)for(let x=gx-radius;x<=gx+radius;x++){const seed=x*73+y*173+level*97;if(hash(seed)>cover(layer.cover))continue;const lon=((x+hash(seed+2)) *lonStep+540)%360-180,lat=Math.max(-89.9,Math.min(89.9,(y+hash(seed+3))*.045)),grey=night?.4:r.storm?.7:r.rain||r.snow?.8:.98;
     clouds.add({position:C.Cartesian3.fromDegrees(lon,lat,Math.max(50,layer.baseM-datum+thickness*.5)),scale:new C.Cartesian2((layer.cover==='OVC'?9000:5500)+hash(seed+4)*2500,thickness*.8),maximumSize:new C.Cartesian3(20,10,12),slice:.45,brightness:night?.45:r.storm?.8:1,color:new C.Color(grey,grey,Math.min(1,grey+.035),1)});
    }
    // Coarser, world-anchored clouds keep the deck visible toward the horizon from cruise altitude.
    const outerStep=.35/cos,ox=Math.floor(f.lon/outerStep),oy=Math.floor(f.lat/.35),layer=r.clouds[0];
    if(layer)for(let y=oy-2;y<=oy+2;y++)for(let x=ox-2;x<=ox+2;x++){if(x===ox&&y===oy)continue;const seed=x*71+y*197;if(hash(seed)>cover(layer.cover))continue;const grey=night?.43:r.storm?.73:r.rain||r.snow?.83:.98;clouds.add({position:C.Cartesian3.fromDegrees(((x+.5)*outerStep+540)%360-180,Math.max(-89.9,Math.min(89.9,(y+.5)*.35)),Math.max(50,layer.baseM-datum+thickness*.4)),scale:new C.Cartesian2(35000,Math.max(900,thickness*.8)),maximumSize:new C.Cartesian3(25,8,12),slice:.45,brightness:night?.55:.95,color:new C.Color(grey,grey,Math.min(1,grey+.025),1)});}
   }
   const near=eyeAltitude<50000,inside=conditions.inside&&r.clouds.some(c=>cover(c.cover)>.7||hash(gx*73+gy*173)<cover(c.cover));
   if(near){v.scene.fog.enabled=true;v.scene.fog.density=inside?.0012:Math.min(.0002,.00002*10/Math.max(.2,r.visibilityKm??40));v.scene.fog.minimumBrightness=.28;changedFog=true;}else restore();
   if(!near)return;
   if(!inside&&conditions.precipitation&&r.clouds.some(c=>c.cover==='OVC')){ctx.fillStyle='rgba(120,129,139,.13)';ctx.fillRect(0,0,width,height);}
   if(inside){ctx.fillStyle=r.storm?'rgba(83,92,103,.48)':'rgba(200,209,215,.35)';ctx.fillRect(0,0,width,height);}
   const wet=conditions.precipitation*(r.rain||r.snow||Number(r.hail));const count=Math.round((p.lowQuality?85:210)*wet),snow=r.snow>0||r.hail;
   if(!reduced&&count){const slant=Math.sin((((r.windDirection??0)+180)*Math.PI/180)-v.camera.heading)*.35+.13;
    for(let i=0;i<count;i++){const d=particles[i],velocity=snow?.07+.13*d.depth:.7+1.1*d.depth;d.y=(d.y+dt*velocity)%1;d.x=(d.x+dt*(slant*velocity+(snow?Math.sin(now*.001+i)*.025:0))+1)%1;const x=d.x*width,y=d.y*height;
     if(snow){ctx.fillStyle=`rgba(235,243,250,${.35+d.depth*.55})`;ctx.beginPath();ctx.arc(x,y,r.hail?1.5:1+d.depth*2.3,0,Math.PI*2);ctx.fill();}
     else{ctx.strokeStyle=`rgba(203,222,236,${.12+d.depth*.35})`;ctx.lineWidth=.5+d.depth;const length=7+d.depth*24;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-slant*length,y-length);ctx.stroke();}
    }
   }
   if(r.storm&&lightningRef.current&&!reduced&&now>nextFlash){flashUntil=now+140;nextFlash=now+20000+hash(now)*25000;}
   if(now<flashUntil&&!reduced&&lightningRef.current){ctx.strokeStyle='rgba(220,228,255,.8)';ctx.lineWidth=2;ctx.beginPath();const x=width*.72;ctx.moveTo(x,height*.1);ctx.lineTo(x-20,height*.22);ctx.lineTo(x+4,height*.2);ctx.lineTo(x-30,height*.38);ctx.stroke();}
  });
  let lastWake=0;const wake=setInterval(()=>{if(v.isDestroyed()||document.hidden)return;const p=latest.current,f=p.focus(),r=report.current,manual=f?p.manual?.():null;if(!effectsRef.current||!f||(!r&&!manual))return;const active=v.camera.positionCartographic.height<50000&&((manual?.rain??0)||(r?.rain??0)||(r?.snow??0)||(r?.storm??false));if(active||performance.now()-lastWake>1500){v.scene.requestRender();lastWake=performance.now();}},props.lowQuality?66:33);
  return()=>{clearInterval(wake);remove();canvas.remove();if(!v.isDestroyed()){restore();v.scene.primitives.remove(clouds);}};
 },[props.viewer,props.enabled]);
 if(!props.enabled||!props.viewer)return null;const r=data?.report;
 const status=<details className="weather-readout"><summary>Weather · {!focused?'zoom in':r?weatherSummary(r):data?'unavailable':'loading'}</summary>{r&&<p>{r.station==='Manual'?'Manual conditions':`${Math.round(r.distanceKm)} km from report · ${new Date(r.observedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}{data?.status==='stale'?' · refresh delayed':''}</p>}<p>{!focused?'Zoom closer to see local weather.':r?'Cloud shapes, thickness and lightning are illustrative. Reports describe nearby surface conditions.':'No recent nearby report is available. Missing data is not clear weather.'}</p><label><input type="checkbox" checked={effects} onChange={e=>setEffects(e.target.checked)}/>Weather effects</label><label><input type="checkbox" checked={lightning} disabled={props.reduced} onChange={e=>setLightning(e.target.checked)}/>Lightning effects</label></details>;
 return props.statusHost?createPortal(status,props.statusHost):status;
}
