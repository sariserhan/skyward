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
