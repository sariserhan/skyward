import type {AirportGeometry} from '../types.ts';
const cache=new WeakMap<AirportGeometry,AirportGeometry['paths']>();
/** Join mapped T-junctions within survey precision, not arbitrary nearby taxiways.
 * Only path endpoints may connect to another mapped segment, with a 2 m tolerance.
 * Spatial buckets keep the search local at large airports.
 */
export function connectedTaxiPaths(airport:AirportGeometry){
 const saved=cache.get(airport);if(saved)return saved;
 const paths=airport.paths.filter(p=>['taxiway','taxilane','parking_position'].includes(p.kind));
 const c=Math.cos(airport.lat*Math.PI/180),scale=111120;
 const xy=([lon,lat]:number[])=>({x:((lon-airport.lon+540)%360-180)*scale*c,y:(lat-airport.lat)*scale});
 const cell=100,buckets=new Map<string,{path:number;point:[number,number];x:number;y:number}[]>();
 paths.forEach((p,path)=>{if(p.points.length<2)return;for(const point of [p.points[0],p.points.at(-1)!]){const v={...xy(point),path,point},key=`${Math.floor(v.x/cell)}/${Math.floor(v.y/cell)}`;const bucket=buckets.get(key)??[];bucket.push(v);buckets.set(key,bucket);}});
 const result=paths.map((p,path)=>{
  const points:typeof p.points=[];
  for(let i=1;i<p.points.length;i++){
   const a=p.points[i-1],b=p.points[i],u=xy(a),v=xy(b),dx=v.x-u.x,dy=v.y-u.y,d2=dx*dx+dy*dy;
   points.push(a);if(d2<.01||d2>2000**2)continue;
   const hits:{t:number;point:[number,number]}[]=[];
   for(let x=Math.floor((Math.min(u.x,v.x)-2)/cell);x<=Math.floor((Math.max(u.x,v.x)+2)/cell);x++)for(let y=Math.floor((Math.min(u.y,v.y)-2)/cell);y<=Math.floor((Math.max(u.y,v.y)+2)/cell);y++){
    for(const end of buckets.get(`${x}/${y}`)??[]){if(end.path===path)continue;const t=((end.x-u.x)*dx+(end.y-u.y)*dy)/d2;
     if(t<=0||t>=1||Math.hypot(end.x-u.x-t*dx,end.y-u.y-t*dy)>2)continue;
     hits.push({t,point:end.point});
    }
   }
   hits.sort((a,b)=>a.t-b.t);for(const hit of hits)if(points.at(-1)![0]!==hit.point[0]||points.at(-1)![1]!==hit.point[1])points.push(hit.point);
  }
  if(p.points.length)points.push(p.points.at(-1)!);return {...p,points};
 });
 cache.set(airport,result);return result;
}
