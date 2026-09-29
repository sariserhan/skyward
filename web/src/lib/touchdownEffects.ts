import type * as Cesium from 'cesium';
import {aircraftGearConfiguration} from './aircraftRig';
import {sourcedGearAnchors} from './landingGear';
import {lightAnchorToBody} from './aircraftLights';
import {surfaceHeight} from './surfaceHeight';
import {touchdownTransition} from './touchdown.ts';
/** Brief presentation effects at wheel contact; no claim of an observed tire event. */
export function installTouchdownEffects(C:typeof Cesium,v:Cesium.Viewer,state:()=>{id:string|null;type:string;audio:boolean;reduced:boolean}){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d')!;
 const glow=ctx.createRadialGradient(32,32,1,32,32,30);glow.addColorStop(0,'rgba(224,229,233,.65)');glow.addColorStop(.4,'rgba(203,211,218,.4)');glow.addColorStop(1,'rgba(210,218,225,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);
 const cloud=v.scene.primitives.add(new C.BillboardCollection()),puffs=Array.from({length:12},(_,i)=>cloud.add({id:`touchdown-smoke-${i}`,image:canvas,show:false,width:3,height:3,sizeInMeters:true,color:C.Color.WHITE}));
 let id:string|null=null,previous:{ground:boolean;gear:number}|null=null,start=-Infinity,origins:Cesium.Cartesian3[]=[],audio:AudioContext|null=null,master:GainNode|null=null,disposed=false;
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');
 const sound=()=>{try{
  audio??=new AudioContext();if(!master){master=audio.createGain();master.gain.value=.35;master.connect(audio.destination);}const c=audio,began=performance.now();
  void c.resume().then(()=>{if(disposed||performance.now()-began>250||!state().audio)return;const at=c.currentTime;
   const thump=c.createOscillator(),level=c.createGain();thump.frequency.setValueAtTime(95,at);thump.frequency.exponentialRampToValueAtTime(35,at+.22);level.gain.setValueAtTime(.001,at);level.gain.linearRampToValueAtTime(.65,at+.015);level.gain.exponentialRampToValueAtTime(.001,at+.35);thump.connect(level).connect(master!);thump.start(at);thump.stop(at+.36);thump.onended=()=>{thump.disconnect();level.disconnect();};
   const noise=c.createBuffer(1,Math.floor(c.sampleRate*.65),c.sampleRate),data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
   const tire=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();tire.buffer=noise;filter.type='bandpass';filter.frequency.setValueAtTime(1800,at);filter.frequency.exponentialRampToValueAtTime(500,at+.5);filter.Q.value=2;gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(.5,at+.03);gain.gain.exponentialRampToValueAtTime(.001,at+.6);tire.connect(filter).connect(gain).connect(master!);tire.start(at);tire.onended=()=>{tire.disconnect();filter.disconnect();gain.disconnect();};
  }).catch(()=>{/* Autoplay may be blocked; never queue a delayed landing sound. */});
 }catch{/* Audio unavailable must not interrupt rendering. */}};
 const remove=v.scene.preRender.addEventListener(()=>{
  const s=state(),body=s.id?v.entities.getById(s.id):undefined,cfg=body&&aircraftGearConfiguration(body),now=performance.now();
  if(master&&audio)master.gain.setTargetAtTime(s.audio&&!document.hidden?.35:0,audio.currentTime,.03);
  if(s.id!==id){id=s.id;previous=null;start=-Infinity;}
  if(!document.hidden&&body&&cfg){
   if(touchdownTransition(previous,cfg)){
    const matrix=body.computeModelMatrix(v.clock.currentTime),gear=sourcedGearAnchors(s.type);start=now;
    if(matrix){const main=gear?.main??[3,-1,-2],radius=gear?.radius??.5,drop=gear?main[1]-Math.min(gear.main[1],gear.nose[1])+gear.strut:2;
     origins=[-1,1].map(side=>{const point=C.Matrix4.multiplyByPoint(matrix,C.Cartesian3.fromArray(lightAnchorToBody([side*Math.abs(main[0]),main[1]-drop-radius+.2,main[2]])),new C.Cartesian3()),position=C.Cartographic.fromCartesian(point),ground=v.terrainProvider instanceof C.EllipsoidTerrainProvider?0:surfaceHeight(v.scene.globe.getHeight(position));return C.Cartesian3.fromRadians(position.longitude,position.latitude,Math.max(position.height,ground+1.5));});}
    if(s.audio)sound();
   }
   previous={ground:cfg.ground,gear:cfg.gear};
  }else previous=null;
  const age=(now-start)/1000,visible=!!s.id&&!document.hidden&&!s.reduced&&!media.matches&&age>=0&&age<2.8;
  for(let i=0;i<puffs.length;i++){const p=puffs[i];p.show=visible&&origins.length===2;if(!p.show)continue;const origin=origins[i%2],frame=C.Transforms.eastNorthUpToFixedFrame(origin),phase=Math.floor(i/2);p.position=C.Matrix4.multiplyByPoint(frame,new C.Cartesian3((phase-2.5)*.35+age*.6,Math.sin(i*2)*age*.6,.3+age*.65),new C.Cartesian3());p.width=p.height=1+age*(1.8+phase*.15);p.color=C.Color.WHITE.withAlpha(Math.max(0,(1-age/2.8)*.55));}
  if(visible)v.scene.requestRender();
 });
 return()=>{disposed=true;remove();if(audio&&audio.state!=='closed')void audio.close();if(!v.isDestroyed())v.scene.primitives.remove(cloud);};
}
