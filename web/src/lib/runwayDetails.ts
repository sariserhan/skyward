import type {Runway} from '../types.ts';
export function runwayLightPoints(runway:Runway){
 if(![...runway.a,...runway.b,runway.width,runway.length].every(Number.isFinite)||runway.length<=100||runway.width<=0)return [];
 const lat=(runway.a[1]+runway.b[1])/2,c=Math.cos(lat*Math.PI/180),dl=((runway.b[0]-runway.a[0]+540)%360)-180,dx=dl*c,dy=runway.b[1]-runway.a[1],length=Math.hypot(dx,dy);if(length===0||Math.abs(c)<.01)return [];
 const count=Math.min(48,Math.max(4,Math.ceil(runway.length/90))),offset=runway.width/2/111120;
 const rows:{lon:number;lat:number;threshold:boolean}[]=[];
 for(let i=0;i<=count;i++)for(const side of [-1,1])rows.push({lon:((runway.a[0]+dl*i/count-side*dy/length*offset/c+540)%360)-180,lat:runway.a[1]+dy*i/count+side*dx/length*offset,threshold:i===0||i===count});
 return rows;
}
/** Illustrative markings aligned to mapped thresholds, not certified airport charts. */
export function runwayMarkings(r:Runway){
 if(!runwayLightPoints(r).length)return [];
 const c=Math.cos((r.a[1]+r.b[1])/2*Math.PI/180),dx=((r.b[0]-r.a[0]+540)%360)-180,dy=r.b[1]-r.a[1],L=Math.hypot(dx*c,dy);
 const point=(t:number,side:number)=>[(((r.a[0]+dx*t-dy/L*side/111120/c)+540)%360)-180,r.a[1]+dy*t+dx*c/L*side/111120] as [number,number];
 const rows:[number,number][][]=[];
 for(let m=90;m<r.length-90;m+=120)rows.push([point(m/r.length,0),point(Math.min(m+35,r.length-90)/r.length,0)]);
 for(const end of [0,1]){
  const sign=end? -1:1;
  for(const side of [-1,1])for(let i=1;i<=3;i++)rows.push([point(end+sign*20/r.length,side*i*r.width/9),point(end+sign*55/r.length,side*i*r.width/9)]);
  for(const m of [300,450])if(r.length>m*3)for(const side of [-1,1])rows.push([point(end+sign*m/r.length,side*r.width*.25),point(end+sign*(m+35)/r.length,side*r.width*.25)]);
 }
 return rows;
}
export function approachLightPoints(r:Runway){
 if(!runwayLightPoints(r).length)return [];
 const dx=((r.b[0]-r.a[0]+540)%360)-180,dy=r.b[1]-r.a[1];
 return [0,1].flatMap(end=>Array.from({length:8},(_,i)=>{const t=end+(end?1:-1)*(i+1)*60/r.length;return {lon:((r.a[0]+dx*t+540)%360)-180,lat:r.a[1]+dy*t,threshold:false};}));
}
