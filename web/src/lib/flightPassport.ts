import {AIRPORTS} from './airportCatalog.ts';
import {distanceNm} from './experience.ts';
export type PassportFlight={date:string;from:string;to:string;callsign:string;aircraftType:string;durationMinutes:number;experience?:'flown'|'watched'};
export function passportSummary(entries:PassportFlight[],year:string){
 const flights=entries.filter(e=>year==='all'||e.date.startsWith(year)),airports=[...new Set(flights.flatMap(e=>[e.from,e.to]))],types=[...new Set(flights.map(e=>e.aircraftType).filter(Boolean))].sort();
 const km=Math.round(flights.reduce((sum,e)=>{const a=AIRPORTS[e.from],b=AIRPORTS[e.to];return sum+(a&&b?distanceNm(a.lat,a.lon,b.lat,b.lon)*1.852:0);},0));
 return {flights,airports,types,km,flown:flights.filter(e=>e.experience!=='watched').length,watched:flights.filter(e=>e.experience==='watched').length,minutes:flights.reduce((n,e)=>n+e.durationMinutes,0)};
}
export function globePoint(lat:number,lon:number,center:number){const r=Math.PI/180,l=(lon-center)*r,p=lat*r;return {x:180+145*Math.cos(p)*Math.sin(l),y:160-145*Math.sin(p),visible:Math.cos(p)*Math.cos(l)>=0};}
export function passportRoute(from:string,to:string,center:number){
 const a=AIRPORTS[from],b=AIRPORTS[to];if(!a||!b)return '';const r=Math.PI/180,v=(p:typeof a)=>[Math.cos(p.lat*r)*Math.cos(p.lon*r),Math.cos(p.lat*r)*Math.sin(p.lon*r),Math.sin(p.lat*r)],x=v(a),y=v(b),angle=Math.acos(Math.max(-1,Math.min(1,x.reduce((s,n,i)=>s+n*y[i],0))));
 if(Math.abs(Math.sin(angle))<.00001)return '';let path='',last=false;
 for(let i=0;i<=50;i++){const t=i/50,p=x.map((n,j)=>(n*Math.sin((1-t)*angle)+y[j]*Math.sin(t*angle))/Math.sin(angle)),point=globePoint(Math.atan2(p[2],Math.hypot(p[0],p[1]))/r,Math.atan2(p[1],p[0])/r,center);if(point.visible)path+=`${last?'L':'M'}${point.x.toFixed(2)},${point.y.toFixed(2)} `;last=point.visible;}return path;
}
