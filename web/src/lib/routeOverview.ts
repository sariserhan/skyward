import {contiguous} from './positionQuality.ts';
import type {Aircraft,FlightRoute,TrailPoint} from '../types.ts';
import {distanceNm} from './experience.ts';
export function routeOverview(route:FlightRoute|null,a:Aircraft,trail:TrailPoint[],now:number){
 if(!route||route.airports.length!==2||!['PLAUSIBLE','UNVERIFIED'].includes(route.status)||a.lat===null||a.lon===null||!Number.isFinite(a.lat)||!Number.isFinite(a.lon))return null;
 const [origin,destination]=route.airports;
 const total=distanceNm(origin.lat,origin.lon,destination.lat,destination.lon),from=distanceNm(origin.lat,origin.lon,a.lat,a.lon),remaining=distanceNm(a.lat,a.lon,destination.lat,destination.lon);
 let observed=0,gaps=0;for(let i=1;i<trail.length;i++){const before=trail[i-1],after=trail[i];if(after.time>now)continue;if(!contiguous(before,after)){gaps++;continue;}observed+=distanceNm(before.lat,before.lon,after.lat,after.lon);}
 return {origin,destination,total,from,remaining,observed,gaps,fraction:from+remaining>0?from/(from+remaining):0};
}
export function routeArc(a:{lon:number;lat:number},b:{lon:number;lat:number},steps=64){
 const rad=Math.PI/180,vector=(p:{lon:number;lat:number})=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.cos(p.lat*rad)*Math.sin(p.lon*rad),Math.sin(p.lat*rad)];const x=vector(a),y=vector(b),angle=Math.acos(Math.max(-1,Math.min(1,x.reduce((sum,v,i)=>sum+v*y[i],0))));
 return Array.from({length:steps+1},(_,i)=>{const f=i/steps;if(Math.abs(Math.sin(angle))<1e-8){const dl=((b.lon-a.lon+540)%360)-180;return {lon:((a.lon+dl*f+540)%360)-180,lat:a.lat+(b.lat-a.lat)*f};}const u=Math.sin((1-f)*angle)/Math.sin(angle),v=Math.sin(f*angle)/Math.sin(angle),p=x.map((n,j)=>u*n+v*y[j]);return {lon:Math.atan2(p[1],p[0])/rad,lat:Math.atan2(p[2],Math.hypot(p[0],p[1]))/rad};});
}

/** Project onto the fixed planned arc; lateral deviations never redraw that arc. */
export function splitRouteProgress(arc:{lon:number;lat:number}[],position:{lon:number;lat:number}|null,previous=0){
 const rad=Math.PI/180,vector=(p:{lon:number;lat:number})=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.cos(p.lat*rad)*Math.sin(p.lon*rad),Math.sin(p.lat*rad)];
 let fraction=Math.max(0,Math.min(1,Number.isFinite(previous)?previous:0)),best=Infinity,projected=0;
 if(position&&Number.isFinite(position.lon)&&Number.isFinite(position.lat)&&arc.length>1){
  const p=vector(position);
  for(let i=0;i<arc.length-1;i++){
   const a=vector(arc[i]),b=vector(arc[i+1]),d=b.map((v,j)=>v-a[j]),length=d.reduce((s,v)=>s+v*v,0);
   const t=length>0?Math.max(0,Math.min(1,d.reduce((s,v,j)=>s+v*(p[j]-a[j]),0)/length)):0;
   const error=a.reduce((s,v,j)=>s+(v+t*d[j]-p[j])**2,0);
   if(error<best){best=error;projected=(i+t)/(arc.length-1);}
  }
  fraction=Math.max(fraction,projected);
 }
 if(arc.length<2||fraction<=0)return {fraction,completed:[],ahead:arc};
 if(fraction>=1)return {fraction,completed:arc,ahead:[]};
 const at=fraction*(arc.length-1),index=Math.floor(at),t=at-index,a=vector(arc[index]),b=vector(arc[index+1]),p=a.map((v,j)=>v+(b[j]-v)*t);
 const split={lon:Math.atan2(p[1],p[0])/rad,lat:Math.atan2(p[2],Math.hypot(p[0],p[1]))/rad};
 return {fraction,completed:[...arc.slice(0,index+1),split],ahead:[split,...arc.slice(index+1)]};
}
