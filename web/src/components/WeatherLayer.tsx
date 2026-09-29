import {tagRenderLayer} from '../lib/renderLayers';
import {readRenderStats} from '../lib/renderDiagnostics';
import {createWeatherSky,weatherSkyAmount} from '../lib/weatherSky';
import {publishWeatherAudio,publishThunder,clearWeatherAudio} from '../lib/weatherAudio';
import {addCloudVolume} from '../lib/cloudVolumes';
import {makeLightning,lightningIntensity,type LightningStrike} from '../lib/lightning';
import {publishWindshieldWeather} from '../lib/windshield';
import {GlobeClouds} from './GlobeClouds';
import {publishWeather} from '../lib/weatherMotion';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type * as Cesium from 'cesium';
import {reportDistanceKm,cloudImmersion,altitudeWeather,cloudThickness,weatherSummary,type LocalWeather,type WeatherFocus,type WeatherReport} from '../lib/localWeather';
import type {SimWeather} from '../lib/simulatorWeather';
import {solarElevation,sunDirectionFixed} from '../lib/solarLighting';
import './weather-layer.css';
interface Props {overview?:boolean;viewer:Cesium.Viewer|null;enabled:boolean;focus:()=>WeatherFocus|null;manual?:()=>SimWeather|undefined;onReport?:(r:WeatherReport|null)=>void;statusHost?:HTMLElement|null;reduced?:boolean;lowQuality?:boolean;}
const hash=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const cover=(s:string)=>({FEW:.2,SCT:.5,BKN:.8,OVC:1,VV:1}[s]??.4);
function manualReport(w:SimWeather,f:WeatherFocus):WeatherReport{return {station:'Manual',lat:f.lat,lon:f.lon,elevationM:f.datumM??0,observedAt:Date.now(),distanceKm:0,raw:'Manual simulator weather',clouds:w.rain?[{cover:'OVC',baseM:(f.datumM??0)+900}]:[],cloudsKnown:true,rain:w.rain,snow:0,hail:false,storm:false,fog:w.visibility<3,visibilityKm:w.visibility,temperatureC:null,windDirection:w.direction,windKnots:w.wind,gustKnots:w.wind+w.gusts};}
export function WeatherLayer(props:Props){
 const latest=useRef(props);latest.current=props;const report=useRef<WeatherReport|null>(null),[data,setData]=useState<LocalWeather|null>(null),[focused,setFocused]=useState(false),[effects,setEffects]=useState(()=>{try{return localStorage.getItem('skyward.weather.effects')!=='off';}catch{return true;}}),[lightning,setLightning]=useState(true),[motion,setMotion]=useState(true),motionRef=useRef(motion),effectsRef=useRef(effects),lightningRef=useRef(lightning);effectsRef.current=effects;lightningRef.current=lightning;motionRef.current=motion;
 useEffect(()=>{try{localStorage.setItem('skyward.weather.effects',effects?'on':'off');}catch{}},[effects]);
 useEffect(()=>{if(props.viewer&&!props.viewer.isDestroyed())props.viewer.scene.requestRender();},[props.viewer,effects,lightning,motion,data]);
 useEffect(()=>{if(!props.viewer||!props.enabled){report.current=null;latest.current.onReport?.(null);return;}let disposed=false,busy=false,lastKey='',lastFetch=0;const abort=new AbortController();
  const poll=async()=>{if(disposed||busy||document.hidden)return;const p=latest.current,f=p.focus();setFocused(!!f);if(!f){report.current=null;p.onReport?.(null);lastKey='';return;}const manual=p.manual?.();if(manual){report.current=manualReport(manual,f);setData({status:'current',fetchedAt:Date.now(),report:report.current});p.onReport?.(null);lastKey='';return;}
   const key=`${Math.round(f.lat*4)},${Math.round(f.lon*4)}`;if(key===lastKey&&Date.now()-lastFetch<600000)return;if(key!==lastKey&&report.current&&reportDistanceKm(report.current,f)>150){report.current=null;p.onReport?.(null);}busy=true;lastKey=key;lastFetch=Date.now();try{const r=await fetch(`/api/local-weather?lat=${f.lat.toFixed(4)}&lon=${f.lon.toFixed(4)}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});if(!r.ok)throw Error();const value=await r.json() as LocalWeather;if(!disposed){const current=latest.current.focus();if(!current||value.report&&reportDistanceKm(value.report,current)>150){report.current=null;p.onReport?.(null);lastKey='';return;}report.current=value.report;setData(value);p.onReport?.(value.report);}}catch{if(!disposed){const retained=report.current&&Date.now()-report.current.observedAt<7200000?report.current:null;report.current=retained;setData({status:retained?'stale':'unavailable',report:retained,fetchedAt:null});p.onReport?.(retained);lastFetch=Date.now()-570000;}}finally{busy=false;}};
  void poll();const timer=setInterval(()=>void poll(),3000);return()=>{disposed=true;abort.abort();clearInterval(timer);report.current=null;};
 },[props.viewer,props.enabled,props.manual]);
 useEffect(()=>{const v=props.viewer;if(!v||!props.enabled||v.isDestroyed())return;const C=window.Cesium,volumes=v.scene.primitives.add(new C.PrimitiveCollection());
  tagRenderLayer(volumes,'cloud collections');
  const canvas=document.createElement('canvas');canvas.className='weather-particles';canvas.setAttribute('aria-hidden','true');v.container.appendChild(canvas);const ctx=canvas.getContext('2d');if(!ctx){v.scene.primitives.remove(volumes);canvas.remove();return;}
  let windEast=0,windNorth=0;const moving=new Map<string,{primitive:Cesium.Primitive;lon:number;lat:number;height:number;opacity:number;wanted:boolean}>();
  const pending=new Map<string,Parameters<typeof addCloudVolume>[2]>();
  const want=(id:string,options:Parameters<typeof addCloudVolume>[2])=>{const old=moving.get(id);if(old){old.wanted=true;return;}pending.set(id,options);};
  let last=0,cloudKey='',lastCloud=0,width=0,height=0,nextFlash=0,strike:LightningStrike|null=null,stormKey='';const particles=Array.from({length:240},(_,i)=>({x:hash(i+1),y:hash(i+300),depth:.2+hash(i+700)*.8}));
  const weatherSky=createWeatherSky(v);
  const fog={enabled:v.scene.fog.enabled,density:v.scene.fog.density,minimumBrightness:v.scene.fog.minimumBrightness};let changedFog=false;
  const restore=()=>{weatherSky.restore();if(changedFog){Object.assign(v.scene.fog,fog);changedFog=false;}};
  const remove=v.scene.preRender.addEventListener(()=>{const now=performance.now();if(now-last<(latest.current.lowQuality?65:32))return;const dt=Math.min(.25,(now-last)/1000||.033);last=now;
   const p=latest.current,limited=readRenderStats(v).backgroundLimited,f=p.focus(),manual=f?p.manual?.():null,r=manual&&f?manualReport(manual,f):report.current,reduced=p.reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const w=v.canvas.clientWidth,h=v.canvas.clientHeight;if(w!==width||h!==height){width=w;height=h;canvas.width=w;canvas.height=h;}ctx.clearRect(0,0,width,height);
   if(!effectsRef.current||!f||!r||reportDistanceKm(r,f)>150||Date.now()-r.observedAt>7200000||document.hidden||v.scene.mode!==C.SceneMode.SCENE3D){strike=null;nextFlash=0;stormKey='';volumes.show=false;clearWeatherAudio(v);publishWeather(v,null);publishWindshieldWeather(v,null);restore();return;}volumes.show=true;publishWeather(v,motionRef.current?r:null);publishWindshieldWeather(v,r);
   if(!reduced){const bearing=((r.windDirection??0)+180)*Math.PI/180,speed=Math.min(25,r.windKnots??0)*.514444;windEast+=Math.sin(bearing)*speed*dt;windNorth+=Math.cos(bearing)*speed*dt;}
   const datum=f.datumM??0,eyeAltitude=v.camera.positionCartographic.height+datum,conditions=altitudeWeather(r,eyeAltitude),cos=Math.max(.3,Math.cos(r.lat*Math.PI/180)),lonStep=.045/cos,gx=Math.floor((f.lon-windEast/(111320*cos))/lonStep),gy=Math.floor((f.lat-windNorth/111320)/.045),key=`${r.station}:${manual?'manual':r.observedAt}:${gx}:${gy}:${datum}:${r.rain}:${r.clouds.length}:${p.lowQuality}:${Math.floor(Date.now()/300000)}`;
   if(now-lastCloud>1000&&key!==cloudKey){cloudKey=key;lastCloud=now;pending.clear();for(const cloud of moving.values())cloud.wanted=false;const thickness=cloudThickness(r),radius=p.lowQuality?1:2,sun=sunDirectionFixed(C,v.clock.currentTime),elevation=solarElevation(C,C.Cartesian3.fromDegrees(f.lon,f.lat),sun),night=v.scene.globe.enableLighting&&elevation< -3;
    for(const [level,layer] of r.clouds.slice(0,p.lowQuality?1:2).entries())for(let y=gy-radius;y<=gy+radius;y++)for(let x=gx-radius;x<=gx+radius;x++){const seed=x*73+y*173+level*97;if(hash(seed)>cover(layer.cover))continue;const id=`${r.station}:${level}:${x}:${y}:${layer.baseM}:${datum}:${layer.cover}:${p.lowQuality}:${r.storm}:${!!(r.rain||r.snow)}`;const existing=moving.get(id);if(existing){existing.wanted=true;existing.primitive.appearance.material!.uniforms.cloudNight=Number(night);continue;}const options={lon:((x+hash(seed+2))*lonStep+windEast/(111320*cos)+540)%360-180,lat:Math.max(-89.9,Math.min(89.9,(y+hash(seed+3))*.045+windNorth/111320)),base:Math.max(50,layer.baseM-datum),thickness:thickness*(.85+hash(seed+5)*.3),size:(cover(layer.cover)>.7?4500:2200)+hash(seed+4)*1600,seed,night,storm:r.storm,wet:!!(r.rain||r.snow),low:!!p.lowQuality};want(id,options);}
    // Distant clouds share the near-field volumetric renderer. Stable cells are
    // retained and faded, rather than rebuilding a flat horizon billboard deck.
    const outerStep=.2/cos,ox=Math.floor((f.lon-windEast/(111320*cos))/outerStep),oy=Math.floor((f.lat-windNorth/111320)/.2),layer=r.clouds[0],outerRadius=p.lowQuality?1:2;
    if(layer)for(let y=oy-outerRadius;y<=oy+outerRadius;y++)for(let x=ox-outerRadius;x<=ox+outerRadius;x++){
     if(x===ox&&y===oy)continue;
     const seed=x*71+y*197;if(hash(seed)>cover(layer.cover))continue;
     const id=`far:${r.station}:${x}:${y}:${layer.baseM}:${datum}:${layer.cover}:${p.lowQuality}:${r.storm}:${!!(r.rain||r.snow)}`;
     want(id,{lon:((x+hash(seed))*outerStep+windEast/(111320*cos)+540)%360-180,lat:Math.max(-89.9,Math.min(89.9,(y+hash(seed+1))*.2+windNorth/111320)),base:Math.max(50,layer.baseM-datum),thickness:thickness*(.85+hash(seed+5)*.3),size:9000+hash(seed+2)*5000,seed,night,storm:r.storm,wet:!!(r.rain||r.snow),low:true,distant:true});
    }
   }
   // Spread GPU resource creation across frames; visible volumes stay in place.
   let created=0;for(const [id,options] of pending){if(created++>=((p.lowQuality||limited)?1:2))break;pending.delete(id);const primitive=addCloudVolume(C,volumes,options);moving.set(id,{primitive,opacity:0,wanted:true,lon:options.lon-windEast/(111320*cos),lat:options.lat-windNorth/111320,height:options.base+options.thickness*.5});}

   for(const [id,cloud] of moving){cloud.opacity=Math.max(0,Math.min(1,cloud.opacity+(cloud.wanted?1:-1)*dt/2.5));if(!cloud.wanted&&cloud.opacity===0){volumes.remove(cloud.primitive);moving.delete(id);continue;}cloud.primitive.appearance.material!.uniforms.cloudOpacity=cloud.opacity;
    cloud.primitive.appearance.material!.uniforms.cloudSteps=id.startsWith('far:')?(limited?4:6):p.lowQuality?10:20;const position=C.Cartesian3.fromDegrees(cloud.lon+windEast/(111320*cos),cloud.lat+windNorth/111320,cloud.height);C.Matrix4.setTranslation(cloud.primitive.modelMatrix,position,cloud.primitive.modelMatrix);}
   const near=eyeAltitude<50000,inside=conditions.inside&&r.clouds.some(c=>cover(c.cover)>.7||hash(gx*73+gy*173)<cover(c.cover));
   const immersion=inside?cloudImmersion(r,eyeAltitude):0;
   if(near)weatherSky.update(weatherSkyAmount(r,eyeAltitude),dt);
   publishWeatherAudio(v,near?conditions.precipitation*r.rain:0,near&&r.storm&&lightningRef.current&&!reduced);
   if(near){v.scene.fog.enabled=true;v.scene.fog.density=Math.max(immersion*.0012,Math.min(.0002,.00002*10/Math.max(.2,r.visibilityKm??40)));v.scene.fog.minimumBrightness=.28;changedFog=true;}else restore();
   if(!near){strike=null;nextFlash=0;return;}
   if(!inside&&conditions.precipitation&&r.clouds.some(c=>c.cover==='OVC')){ctx.fillStyle='rgba(120,129,139,.13)';ctx.fillRect(0,0,width,height);}
   if(inside){ctx.fillStyle=r.storm?`rgba(83,92,103,${.48*immersion})`:`rgba(200,209,215,${.35*immersion})`;ctx.fillRect(0,0,width,height);}
   const wet=conditions.precipitation*(r.rain||r.snow||Number(r.hail));const count=Math.round((p.lowQuality?85:210)*wet),snow=r.snow>0||r.hail;
   if(!reduced&&count){const slant=Math.sin((((r.windDirection??0)+180)*Math.PI/180)-v.camera.heading)*.35+.13;
    for(let i=0;i<count;i++){const d=particles[i],velocity=snow?.07+.13*d.depth:.7+1.1*d.depth;d.y=(d.y+dt*velocity)%1;d.x=(d.x+dt*(slant*velocity+(snow?Math.sin(now*.001+i)*.025:0))+1)%1;const x=d.x*width,y=d.y*height;
     if(snow){ctx.fillStyle=`rgba(235,243,250,${.35+d.depth*.55})`;ctx.beginPath();ctx.arc(x,y,r.hail?1.5:1+d.depth*2.3,0,Math.PI*2);ctx.fill();}
     else{ctx.strokeStyle=`rgba(203,222,236,${.12+d.depth*.35})`;ctx.lineWidth=.5+d.depth;const length=7+d.depth*24;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-slant*length,y-length);ctx.stroke();}
    }
   }
   const activeStorm=r.storm&&lightningRef.current&&!reduced;
   if(!activeStorm){strike=null;nextFlash=0;stormKey='';return;}
   const region=`${r.station}:${Math.round(f.lat)}:${Math.round(f.lon)}`;
   if(region!==stormKey){stormKey=region;strike=null;nextFlash=now+2000+hash(now)*3000;}
   if(!nextFlash)nextFlash=now+2000;
   if(now>=nextFlash){
    const fovy='fovy' in v.camera.frustum?(v.camera.frustum.fovy??Math.PI/3):Math.PI/3;
    const spread=Math.min(.7,Math.atan(Math.tan(fovy/2)*width/Math.max(1,height))*1.1);
    const distance=4500+hash(now+1)*10000,bearing=v.camera.heading+(hash(now+2)-.5)*spread;
    const ground=r.elevationM??f.datumM??0,base=Math.max(ground+900,r.clouds[0]?.baseM??ground+1800);
    const inCloud=inside||eyeAltitude>base+500||hash(now+3)>.65;
    strike=makeLightning({lat:f.lat+Math.cos(bearing)*distance/111320,lon:f.lon+Math.sin(bearing)*distance/(111320*cos),altitude:inCloud?base+1800:base+400},ground,Math.floor(now),now,inCloud);
    publishThunder(v,Math.hypot(distance,strike.origin.altitude-eyeAltitude));
    nextFlash=now+9000+hash(now+4)*15000;
   }
   if(strike&&now-strike.start>strike.duration)strike=null;
   if(strike){
    const intensity=lightningIntensity(now-strike.start);
    const project=(point:{lon:number;lat:number;altitude:number})=>{
     const world=C.Cartesian3.fromDegrees(point.lon,point.lat,point.altitude-datum);
     const delta=C.Cartesian3.subtract(world,v.camera.positionWC,new C.Cartesian3());
     if(C.Cartesian3.dot(delta,v.camera.directionWC)<=0)return null;
     return C.SceneTransforms.worldToWindowCoordinates(v.scene,world);
    };
    const source=project(strike.origin);
    if(source&&intensity>.005){
     ctx.save();ctx.globalCompositeOperation='screen';
     const radius=Math.max(width,height)*.55,glow=ctx.createRadialGradient(source.x,source.y,0,source.x,source.y,radius);
     glow.addColorStop(0,`rgba(204,215,255,${intensity*(inside?.35:.22)})`);glow.addColorStop(.3,`rgba(163,182,237,${intensity*.1})`);glow.addColorStop(1,'rgba(132,157,221,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
     // Cloud-obscured strikes illuminate the deck instead of drawing bolts over the cockpit glass.
     if(!inside)for(const [index,path] of strike.paths.entries()){
      const points=path.map(project);if(points.some(p=>!p))continue;
      ctx.beginPath();points.forEach((p,i)=>{if(i)ctx.lineTo(p!.x,p!.y);else ctx.moveTo(p!.x,p!.y);});
      ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor='#94adff';ctx.shadowBlur=index?8:22;
      ctx.strokeStyle=`rgba(133,161,255,${intensity*(index?.22:.35)})`;ctx.lineWidth=index?3:7;ctx.stroke();
      ctx.shadowBlur=index?3:10;ctx.strokeStyle=`rgba(239,245,255,${intensity*(index?.6:.95)})`;ctx.lineWidth=index?.8:1.8;ctx.stroke();
     }
     ctx.restore();
    }
   }
  });
  let lastWake=0;const wake=setInterval(()=>{if(v.isDestroyed()||document.hidden)return;const p=latest.current,f=p.focus(),r=report.current,manual=f?p.manual?.():null;if(!effectsRef.current||!f||(!r&&!manual))return;const active=v.camera.positionCartographic.height<50000&&((manual?.rain??0)||(r?.rain??0)||(r?.snow??0)||(r?.storm??false)||(!p.reduced&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&r?.clouds.length&&(r.windKnots??0)>0));if(active||pending.size>0||[...moving.values()].some(c=>c.opacity<1||!c.wanted)||performance.now()-lastWake>1500){v.scene.requestRender();lastWake=performance.now();}},props.lowQuality?66:33);
  return()=>{clearInterval(wake);remove();clearWeatherAudio(v);publishWeather(v,null);publishWindshieldWeather(v,null);canvas.remove();if(!v.isDestroyed()){restore();v.scene.primitives.remove(volumes);}};
 },[props.viewer,props.enabled]);
 if(!props.enabled||!props.viewer)return null;const r=data?.report;
 const status=<details className="weather-readout"><summary>Weather · {!focused?'zoom in':r?weatherSummary(r):data?'unavailable':'loading'}</summary>{r&&<p>{r.station==='Manual'?'Manual conditions':`${Math.round(r.distanceKm)} km from report · ${new Date(r.observedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}{data?.status==='stale'?' · refresh delayed':''}</p>}<p>{!focused?'Globe clouds illustrate recent station reports, not satellite coverage. Unreported areas are unknown. Zoom in for local weather.':r?'Cloud shapes, thickness, lightning and turbulence motion are illustrative, not measured aircraft conditions. Reports describe nearby surface conditions.':'No recent nearby report is available. Missing data is not clear weather.'}</p><label><input type="checkbox" checked={effects} onChange={e=>setEffects(e.target.checked)}/>Weather effects</label><label><input type="checkbox" checked={lightning} disabled={props.reduced} onChange={e=>setLightning(e.target.checked)}/>Lightning effects</label><label><input type="checkbox" checked={motion} disabled={props.reduced} onChange={e=>setMotion(e.target.checked)}/>Turbulence animation</label></details>;
 return <>{props.overview&&<GlobeClouds viewer={props.viewer} enabled={effects} lowQuality={props.lowQuality}/ >}{props.statusHost?createPortal(status,props.statusHost):status}</>;
}
