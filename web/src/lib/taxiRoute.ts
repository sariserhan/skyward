import type {AirportGeometry} from '../types.ts';
import {bearing} from './flightPresentation.ts';
type Point={x:number;y:number};
interface Node extends Point {lon:number;lat:number;parking:boolean;edges:Map<number,number>;}
export interface TaxiRoute {stop:{lon:number;lat:number};points:{lon:number;lat:number}[];meters:number[];length:number;gate:string;}
const cache=new WeakMap<AirportGeometry,Map<string,TaxiRoute|null>>();
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Connect only mapped taxiway/taxilane/stand vertices. Never invent a gate assignment. */
export function planTaxi(airport:AirportGeometry,from:{lon:number;lat:number},to:{lon:number;lat:number}):TaxiRoute|null{
 const key=`${from.lon}/${from.lat}/${to.lon}/${to.lat}`;let plans=cache.get(airport);if(!plans){plans=new Map();cache.set(airport,plans);}if(plans.has(key))return plans.get(key)!;
 const fail=()=>{plans!.set(key,null);return null;};
 if(!airport.paths?.length||!airport.gates?.length)return fail();
 const c=Math.cos(airport.lat*Math.PI/180);if(Math.abs(c)<.01)return fail();
 const project=(lon:number,lat:number)=>({x:((lon-airport.lon+540)%360-180)*111120*c,y:(lat-airport.lat)*111120});
 const geo=(p:Point)=>({lon:airport.lon+p.x/(111120*c),lat:airport.lat+p.y/111120});
 const nodes:Node[]=[],ids=new Map<string,number>();
 for(const path of airport.paths){if(!['taxiway','taxilane','parking_position'].includes(path.kind))continue;let previous:number|undefined;
  for(const [lon,lat] of path.points){if(!Number.isFinite(lon)||!Number.isFinite(lat))return fail();const id=`${lon.toFixed(5)}/${lat.toFixed(5)}`;let index=ids.get(id);
   if(index===undefined){index=nodes.length;ids.set(id,index);nodes.push({...project(lon,lat),lon,lat,parking:false,edges:new Map()});if(nodes.length>20000)return fail();}
   if(path.kind==='parking_position')nodes[index].parking=true;
   if(previous!==undefined&&previous!==index){const d=distance(nodes[index],nodes[previous]);if(d>0&&d<2000){nodes[index].edges.set(previous,d);nodes[previous].edges.set(index,d);}}
   previous=index;
  }
 }
 const gates=new Map<number,string>();
 for(const gate of airport.gates){const p=project(...gate.position);let best=-1,near=60;nodes.forEach((n,i)=>{const d=distance(p,n);if(n.parking&&d<near){near=d;best=i;}});if(best>=0)gates.set(best,gate.label);}
 if(!gates.size)return fail();
 const a=project(from.lon,from.lat),b=project(to.lon,to.lat),dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);if(L<400)return fail();
 const costs=nodes.map(()=>Infinity),parents=nodes.map(()=>-1),roots=nodes.map(()=>-1),stops=new Map<number,Point>();
 const heap:{id:number;cost:number}[]=[];
 const push=(item:{id:number;cost:number})=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].cost<=item.cost)break;heap[i]=heap[p];i=p;}heap[i]=item;};
 const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].cost<heap[j].cost)j++;if(heap[j].cost>=last.cost)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
 nodes.forEach((n,i)=>{const t=((n.x-a.x)*dx+(n.y-a.y)*dy)/(L*L),p={x:a.x+t*dx,y:a.y+t*dy};if(t<.4||t>.9||distance(p,n)>30)return;costs[i]=Math.abs(t-.65)*L*.25;roots[i]=i;stops.set(i,p);push({id:i,cost:costs[i]});});
 let end=-1;
 while(heap.length){const current=pop();if(current.cost!==costs[current.id])continue;if(gates.has(current.id)){end=current.id;break;}for(const [next,d] of nodes[current.id].edges){const cost=current.cost+d;if(cost<costs[next]){costs[next]=cost;parents[next]=current.id;roots[next]=roots[current.id];push({id:next,cost});}}}
 if(end<0)return fail();
 const chain:Point[]=[];for(let i=end;i>=0;i=parents[i])chain.push(nodes[i]);chain.reverse();const exit=stops.get(roots[end])!,stop={x:exit.x-dx/L*25,y:exit.y-dy/L*25};chain.unshift(exit);chain.unshift(stop);
 for(let i=chain.length-1;i>0;i--)if(distance(chain[i],chain[i-1])<.1)chain.splice(i,1);
 // Round corners by at most 5 m, staying close to mapped pavement centerlines.
 const smooth:Point[]=[chain[0]];
 for(let i=1;i<chain.length-1;i++){const p=chain[i-1],q=chain[i],r=chain[i+1],d1=distance(p,q),d2=distance(q,r);if(d1<.1||d2<.1)continue;const cut=Math.min(5,d1*.2,d2*.2),u={x:q.x+(p.x-q.x)*cut/d1,y:q.y+(p.y-q.y)*cut/d1},v={x:q.x+(r.x-q.x)*cut/d2,y:q.y+(r.y-q.y)*cut/d2};smooth.push(u);for(let j=1;j<=6;j++){const t=j/6,k=1-t;smooth.push({x:k*k*u.x+2*k*t*q.x+t*t*v.x,y:k*k*u.y+2*k*t*q.y+t*t*v.y});}}
 smooth.push(chain.at(-1)!);const meters=[0];for(let i=1;i<smooth.length;i++)meters.push(meters[i-1]+distance(smooth[i-1],smooth[i]));
 const length=meters.at(-1)!;if(length<20||length>10000)return fail();
 const route={stop:geo(stop),points:smooth.map(geo),meters,length,gate:gates.get(end)!};plans.set(key,route);return route;
}
export function taxiFrame(route:TaxiRoute,seconds:number){
 const speed=6,brake=Math.min(40,route.length/2),cruise=(route.length-brake)/speed,brakeTime=2*brake/speed,t=Math.max(0,seconds),b=Math.min(brakeTime,Math.max(0,t-cruise));
 const d=t<=cruise?t*speed:route.length-brake+speed*b-speed*b*b/(2*brakeTime);
 let i=1;while(i<route.meters.length-1&&route.meters[i]<d)i++;
 const f=Math.max(0,Math.min(1,(d-route.meters[i-1])/Math.max(.001,route.meters[i]-route.meters[i-1]))),a=route.points[i-1],z=route.points[i];
 const at=(distance:number)=>{const x=Math.max(0,Math.min(route.length,distance));let k=1;while(k<route.meters.length-1&&route.meters[k]<x)k++;const u=(x-route.meters[k-1])/Math.max(.001,route.meters[k]-route.meters[k-1]),p=route.points[k-1],q=route.points[k];return {lon:p.lon+(q.lon-p.lon)*u,lat:p.lat+(q.lat-p.lat)*u};};
 return {lon:a.lon+(z.lon-a.lon)*f,lat:a.lat+(z.lat-a.lat)*f,heading:bearing(at(d-3),at(d+3)),groundSpeed:t<=cruise?speed/.514444:Math.max(0,speed*(1-b/brakeTime))/.514444,parked:t>=cruise+brakeTime,gate:route.gate};
}
