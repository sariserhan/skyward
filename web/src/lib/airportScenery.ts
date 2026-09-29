import type {AirportGeometry} from '../types.ts';
type Point=[number,number];
function nearest(p:Point,a:Point,b:Point,c:number){const x=(b[0]-a[0])*c,y=b[1]-a[1],t=Math.max(0,Math.min(1,(((p[0]-a[0])*c*x+(p[1]-a[1])*y)/(x*x+y*y||1))));return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t] as Point;}
function meters(a:Point,b:Point,c:number){return Math.hypot((a[0]-b[0])*c,a[1]-b[1])*111320;}
export function insideFootprint(p:Point,ring:Point[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
/** Decorative short bridges only where a mapped apron joins a nearby terminal.
 * Missing geometry yields no bridge; these are not measured boarding bridges. */
export function airportStandDetails(airport:AirportGeometry,limit=16){
 const c=Math.cos(airport.lat*Math.PI/180);if(c<.15)return [];
 const terminals=airport.surfaces.filter(s=>s.kind==='terminal'),aprons=airport.surfaces.filter(s=>s.kind==='apron');
 return airport.gates.flatMap(g=>{
  if(!aprons.some(s=>insideFootprint(g.position,s.points))||terminals.some(s=>insideFootprint(g.position,s.points)))return [];
  const candidates=terminals.flatMap(s=>s.points.map((p,i)=>nearest(g.position,p,s.points[(i+1)%s.points.length],c))).sort((a,b)=>meters(a,g.position,c)-meters(b,g.position,c));
  const start=candidates[0];if(!start)return [];const length=meters(start,g.position,c);if(length<12||length>65)return [];
  const end:Point=[start[0]+(g.position[0]-start[0])*.65,start[1]+(g.position[1]-start[1])*.65];
  const safe=Array.from({length:9},(_,i)=>[start[0]+(end[0]-start[0])*i/8,start[1]+(end[1]-start[1])*i/8] as Point).every(p=>!airport.runways.some(r=>meters(p,nearest(p,r.a,r.b,c),c)<r.width/2+20));
  const dx=(end[0]-start[0])*c,dy=end[1]-start[1],n=Math.hypot(dx,dy)||1;
  const cart:Point=[end[0]-dy/n*8/111320/c,end[1]+dx/n*8/111320];
  const cartSafe=aprons.some(s=>insideFootprint(cart,s.points))&&!terminals.some(s=>insideFootprint(cart,s.points))&&!airport.runways.some(r=>meters(cart,nearest(cart,r.a,r.b,c),c)<r.width/2+20);
  return safe?[{label:g.label,start,end,gate:g.position,cart:cartSafe?cart:undefined}]:[];
 }).slice(0,Math.max(0,limit));
}
