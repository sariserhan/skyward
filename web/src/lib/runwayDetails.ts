import type {Runway} from '../types.ts';
export function runwayLightPoints(runway:Runway){
 if(![...runway.a,...runway.b,runway.width,runway.length].every(Number.isFinite)||runway.length<=100||runway.width<=0)return [];
 const lat=(runway.a[1]+runway.b[1])/2,c=Math.cos(lat*Math.PI/180),dl=((runway.b[0]-runway.a[0]+540)%360)-180,dx=dl*c,dy=runway.b[1]-runway.a[1],length=Math.hypot(dx,dy);if(length===0||Math.abs(c)<.01)return [];
 const count=Math.min(48,Math.max(4,Math.ceil(runway.length/90))),offset=runway.width/2/111120;
 const rows:{lon:number;lat:number;threshold:boolean}[]=[];
 for(let i=0;i<=count;i++)for(const side of [-1,1])rows.push({lon:((runway.a[0]+dl*i/count-side*dy/length*offset/c+540)%360)-180,lat:runway.a[1]+dy*i/count+side*dx/length*offset,threshold:i===0||i===count});
 return rows;
}
