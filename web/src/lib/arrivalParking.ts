import {groundRouteClear} from './groundSafety.ts';
import type {AirportGeometry} from '../types.ts';
import {planTaxi,type TaxiRoute} from './taxiRoute.ts';
const fallbackCache=new WeakMap<AirportGeometry,Map<string,TaxiRoute|null>>();
/** Watched-arrival animation only: a generic exit/stand when mapped routing is absent. */
export function arrivalParking(airport:AirportGeometry,from:{lon:number;lat:number},to:{lon:number;lat:number},clearance=30):TaxiRoute|null{
 const key=`${from.lon}/${from.lat}/${to.lon}/${to.lat}/${clearance}`;let cache=fallbackCache.get(airport);if(!cache){cache=new Map();fallbackCache.set(airport,cache);}const cached=cache.get(key);if(cache.has(key))return cached!;
 // An unlabeled mapped parking position can still be reached over mapped paths.
 const gates=airport.gates.length?airport.gates:airport.paths.filter(p=>p.kind==='parking_position'&&p.points.length).map((p,i)=>({label:`unassigned stand ${i+1}`,position:p.points.at(-1)!}));
 if(gates.length){const mapped=planTaxi({...airport,gates},from,to,clearance);if(mapped){cache.set(key,mapped);return mapped;}}
 const c=Math.max(.01,Math.cos(airport.lat*Math.PI/180)),dx=(to.lon-from.lon)*111120*c,dy=(to.lat-from.lat)*111120,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
 const portX=(airport.lon-from.lon)*111120*c,portY=(airport.lat-from.lat)*111120,side=portX*(-uy)+portY*ux>=0?1:-1;
 for(const fraction of [.78,.65,.9])for(const direction of [side,-side]){
 const stopAlong=L*fraction,radius=Math.min(65,L*.04),local:{x:number;y:number}[]=[];
 // Tangent-continuous quarter circle exits forward, then slows into a generic stand.
 for(let i=0;i<=32;i++){const angle=i/32*Math.PI/2;local.push({x:stopAlong+radius*Math.sin(angle),y:direction*radius*(1-Math.cos(angle))});}
 local.push({x:stopAlong+radius,y:direction*(radius+100)});
 const points=local.map(p=>({lon:from.lon+(ux*p.x-uy*p.y)/(111120*c),lat:from.lat+(uy*p.x+ux*p.y)/111120})),meters=[0];
 for(let i=1;i<local.length;i++)meters.push(meters[i-1]+Math.hypot(local[i].x-local[i-1].x,local[i].y-local[i-1].y));
 if(!groundRouteClear(airport,points,clearance))continue;
 const route={stop:points[0],points,meters,length:meters.at(-1)!,gate:'illustrative stand (layout unavailable)'};cache.set(key,route);return route;
 }cache.set(key,null);return null;
}
