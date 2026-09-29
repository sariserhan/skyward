import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type * as Cesium from 'cesium';
import {windshieldWeather,windshieldRain,wiperAngle,wiperClears,type WiperMode} from '../lib/windshield';
import './windshield.css';
interface Props {viewer:Cesium.Viewer|null;suspended?:boolean;reduced?:boolean;datumM?:number;}
export function Windshield(props:Props){
 const [dashboard,setDashboard]=useState<Element|null>(null);
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
    setDashboard(parent.querySelector('.cockpit-glareshield'));
    if(w!==width||h!==height){width=w;height=h;host.style.height=`${h}px`;el.width=w;el.height=h;drops=[];}
   }
   if(!width||!height)return;
   const C=window.Cesium,eye=v.camera.positionCartographic,rain=windshieldRain(windshieldWeather(v),C.Math.toDegrees(eye.latitude),C.Math.toDegrees(eye.longitude),eye.height+(p.datumM??0)),reduced=!!p.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
   const active=p.mode!=='off'&&(p.mode!=='auto'||rain>0),rate=p.mode==='fast'||p.mode==='auto'&&rain>.65?1.25:.55;
   const previous=wiperAngle(phase);const parking=phase%1>.0001;
   if(!reduced&&(active||parking)){const next=phase+dt*rate;phase=!active&&Math.floor(next)>Math.floor(phase)?0:next;}
   if(reduced)phase=0;
   const angle=wiperAngle(phase),sweeping=!reduced&&(active||parking),radius=Math.min(width*.31,height*.94),pivots=[width*.28,width*.78],pivotY=height-5;
   if(reduced!==wasReduced){drops=[];wasReduced=reduced;}
   if(reduced){if(active)drops=[];else if(rain&&!drops.length)drops=Array.from({length:50},()=>({x:Math.random()*width,y:Math.random()*height,r:2+Math.random()*3,age:0}));if(!rain)drops=[];}
   else{
    budget+=dt*rain*110;while(budget>=1&&drops.length<260){budget--;drops.push({x:Math.random()*width,y:Math.random()*height,r:1.5+Math.random()*4,age:0});}budget=Math.min(1,budget);
    drops=drops.filter(d=>{d.age+=dt;d.y+=dt*(5+d.r*3);d.x+=Math.sin(d.age*1.7)*dt*2;return d.y<height+8&&d.age<(rain?18:5)&&!(sweeping&&pivots.some(x=>wiperClears(d.x,d.y,x,pivotY,radius,previous,angle)));});
   }
   ctx.clearRect(0,0,width,height);
   for(const d of drops){const alpha=Math.min(1,d.age*5+.25),gradient=ctx.createRadialGradient(d.x-1,d.y-1,0,d.x,d.y,d.r*1.5);gradient.addColorStop(0,`rgba(229,245,255,${.36*alpha})`);gradient.addColorStop(.5,'rgba(130,175,195,.07)');gradient.addColorStop(1,`rgba(9,32,46,${.4*alpha})`);ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(d.x,d.y,d.r,d.r*1.5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=`rgba(230,246,255,${.42*alpha})`;ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(d.x,d.y,d.r*.85,d.r*1.3,0,3.6,5.7);ctx.stroke();}
   // Metal drive arm, hinged carrier and separate rubber blade. Only the
   // outer blade wipes the glass, not the drive arm or its pivot.
   for(const x of pivots){
    const point=(r:number,offset=0)=>({x:x+Math.cos(angle+offset)*radius*r,y:pivotY+Math.sin(angle+offset)*radius*r});
    const elbow=point(.38,.07),joint=point(.77),inner=point(.58),tip=point(1);
    ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor='#0009';ctx.shadowBlur=4;ctx.shadowOffsetY=2;
    ctx.beginPath();ctx.moveTo(x,pivotY);ctx.lineTo(elbow.x,elbow.y);ctx.lineTo(joint.x,joint.y);ctx.strokeStyle='#10191e';ctx.lineWidth=8;ctx.stroke();
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#76858c';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.moveTo(inner.x,inner.y);ctx.lineTo(tip.x,tip.y);ctx.strokeStyle='#080d10';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle='#4d5e65';ctx.lineWidth=2;ctx.stroke();
    for(const t of [.64,.9]){const q=point(t);ctx.beginPath();ctx.moveTo(joint.x,joint.y-3);ctx.lineTo(q.x,q.y);ctx.strokeStyle='#9aa6aa';ctx.lineWidth=1.5;ctx.stroke();}
    ctx.beginPath();ctx.arc(x,pivotY,7,0,Math.PI*2);ctx.fillStyle='#18252c';ctx.fill();ctx.strokeStyle='#7a8b92';ctx.lineWidth=1;ctx.stroke();
   }
   el.dataset.droplets=String(drops.length);el.dataset.rain=rain.toFixed(2);el.dataset.sweep=angle.toFixed(3);
  };
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[]);
 const control=<label className="windshield-control">Wipers<select aria-label="Windshield wipers" value={mode} onChange={e=>setMode(e.target.value as WiperMode)}><option value="auto">Auto</option><option value="off">Off</option><option value="slow">Slow</option><option value="fast">Fast</option></select></label>;
 return <><div className="windshield" ref={root}><canvas ref={canvas} aria-hidden="true"/></div>{dashboard&&createPortal(control,dashboard)}</>;
}
