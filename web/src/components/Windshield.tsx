import {useEffect,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import {windshieldWeather,windshieldRain,wiperAngle,wiperClears,type WiperMode} from '../lib/windshield';
import './windshield.css';
interface Props {viewer:Cesium.Viewer|null;suspended?:boolean;reduced?:boolean;datumM?:number;}
export function Windshield(props:Props){
 const [mode,setMode]=useState<WiperMode>('auto'),canvas=useRef<HTMLCanvasElement>(null),root=useRef<HTMLDivElement>(null),latest=useRef({...props,mode});latest.current={...props,mode};
 useEffect(()=>{
  const el=canvas.current,host=root.current;if(!el||!host)return;const ctx=el.getContext('2d');if(!ctx)return;
  let frame=0,last=0,phase=0,width=0,height=0,lastLayout=0,budget=0,wasReduced=false;
  let drops:{x:number;y:number;r:number;age:number}[]=[];
  const tick=(now:number)=>{
   frame=requestAnimationFrame(tick);const p=latest.current,v=p.viewer;if(!v||v.isDestroyed()||p.suspended||document.hidden){last=now;return;}if(now-last<33)return;
   const dt=Math.min(.065,(now-last)/1000||.033);last=now;
   if(now-lastLayout>500){lastLayout=now;const parent=host.parentElement!,bounds=parent.getBoundingClientRect(),panel=parent.querySelector('.cockpit-dashboard,.cockpit-panel')?.getBoundingClientRect();
    const w=Math.round(bounds.width),h=Math.max(70,Math.round((panel?.top??bounds.bottom)-bounds.top));
    if(w!==width||h!==height){width=w;height=h;host.style.height=`${h}px`;el.width=w;el.height=h;drops=[];}
   }
   if(!width||!height)return;
   const C=window.Cesium,eye=v.camera.positionCartographic,rain=windshieldRain(windshieldWeather(v),C.Math.toDegrees(eye.latitude),C.Math.toDegrees(eye.longitude),eye.height+(p.datumM??0)),reduced=!!p.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
   const active=p.mode!=='off'&&(p.mode!=='auto'||rain>0),rate=p.mode==='fast'||p.mode==='auto'&&rain>.65?1.25:.55;
   const previous=wiperAngle(phase);if(active&&!reduced)phase+=dt*rate;else if(!active)phase=0;
   const angle=active&&!reduced?wiperAngle(phase):-Math.PI+.15,radius=Math.min(width*.48,height*.96),pivots=[width*.25,width*.75],pivotY=height+3;
   if(reduced!==wasReduced){drops=[];wasReduced=reduced;}
   if(reduced){if(active)drops=[];else if(rain&&!drops.length)drops=Array.from({length:50},()=>({x:Math.random()*width,y:Math.random()*height,r:2+Math.random()*3,age:0}));if(!rain)drops=[];}
   else{
    budget+=dt*rain*110;while(budget>=1&&drops.length<260){budget--;drops.push({x:Math.random()*width,y:Math.random()*height,r:1.5+Math.random()*4,age:0});}budget=Math.min(1,budget);
    drops=drops.filter(d=>{d.age+=dt;d.y+=dt*(5+d.r*3);d.x+=Math.sin(d.age*1.7)*dt*2;return d.y<height+8&&d.age<(rain?18:5)&&!(active&&pivots.some(x=>wiperClears(d.x,d.y,x,pivotY,radius,previous,angle)));});
   }
   ctx.clearRect(0,0,width,height);
   for(const d of drops){const alpha=Math.min(1,d.age*5+.25),gradient=ctx.createRadialGradient(d.x-1,d.y-1,0,d.x,d.y,d.r*1.5);gradient.addColorStop(0,`rgba(229,245,255,${.36*alpha})`);gradient.addColorStop(.5,'rgba(130,175,195,.07)');gradient.addColorStop(1,`rgba(9,32,46,${.4*alpha})`);ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(d.x,d.y,d.r,d.r*1.5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=`rgba(230,246,255,${.42*alpha})`;ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(d.x,d.y,d.r*.85,d.r*1.3,0,3.6,5.7);ctx.stroke();}
   // Generic twin wipers. Parked blades remain below the main sight line.
   for(const x of pivots){ctx.lineCap='round';ctx.strokeStyle='#080e12';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(x,pivotY);ctx.lineTo(x+Math.cos(angle)*radius,pivotY+Math.sin(angle)*radius);ctx.stroke();ctx.strokeStyle='#70818a';ctx.lineWidth=1.5;ctx.stroke();}
   el.dataset.droplets=String(drops.length);el.dataset.rain=rain.toFixed(2);el.dataset.sweep=angle.toFixed(3);
  };
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[]);
 return <div className="windshield" ref={root}><canvas ref={canvas} aria-hidden="true"/><label className="windshield-control">Wipers<select aria-label="Windshield wipers" value={mode} onChange={e=>setMode(e.target.value as WiperMode)}><option value="auto">Auto</option><option value="off">Off</option><option value="slow">Slow</option><option value="fast">Fast</option></select></label></div>;
}
