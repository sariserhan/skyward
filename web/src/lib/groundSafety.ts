import type {AirportGeometry,Aircraft} from '../types.ts';
type Point={lon:number;lat:number};type XY={x:number;y:number};
/** Conservative enclosing footprints, including a small wingtip/observation margin. */
export function aircraftRadius(type=''){
 const t=type.trim().toUpperCase();
 if(/^(A225|AN225)$/.test(t))return 70;
 if(/^(A38|B74|A124|AN124)/.test(t)||/^C5[ABM]?$/.test(t))return 60;
 if(/^(B77|B78|B76|A35|A33|A34|A30|A3ST|MD11|DC10|IL76|IL96)/.test(t)||/^C17$/.test(t))return 48;
 if(/^C130|^C30J/.test(t))return 30;
 if(/^(C1|C2|PA|SR|DA|BE|R22|R44)/.test(t))return 13;
 if(/^(C5|C6|GL|LJ|PC|AT|DH8|E13|E14|CRJ)/.test(t))return 23;
 return 30;
}
const xy=(p:Point,port:AirportGeometry):XY=>({x:((p.lon-port.lon+540)%360-180)*111120*Math.cos(port.lat*Math.PI/180),y:(p.lat-port.lat)*111120});
const distance=(p:XY,a:XY,b:XY)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
const cross=(a:XY,b:XY,c:XY)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a:XY,b:XY,c:XY,d:XY){return Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)>=Math.min(a.y,b.y)&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;}
function inside(p:XY,poly:XY[]){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
const cache=new WeakMap<AirportGeometry,{points:XY[];minX:number;maxX:number;minY:number;maxY:number}[]>();
/** Swept footprint test: checking endpoints alone allows tunnelling through thin buildings. */
export function groundSegmentClear(port:AirportGeometry,from:Point,to:Point,radius=30){
 if(![from.lon,from.lat,to.lon,to.lat,radius].every(Number.isFinite))return false;
 let buildings=cache.get(port);if(!buildings){buildings=(port.surfaces??[]).filter(s=>s.kind!=='apron'&&s.points.length>=3).map(s=>{const points=s.points.map(([lon,lat])=>xy({lon,lat},port));return {points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};});cache.set(port,buildings);}
 const a=xy(from,port),b=xy(to,port);
 for(const s of buildings){if(Math.max(a.x,b.x)+radius<s.minX||Math.min(a.x,b.x)-radius>s.maxX||Math.max(a.y,b.y)+radius<s.minY||Math.min(a.y,b.y)-radius>s.maxY)continue;
  if(inside(a,s.points)||inside(b,s.points))return false;
  for(let i=0;i<s.points.length;i++){const c=s.points[i],d=s.points[(i+1)%s.points.length];if(intersects(a,b,c,d)||Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<radius)return false;}
 }return true;
}
export function groundRouteClear(port:AirportGeometry,points:Point[],radius=30){return points.length>0&&points.every((p,i)=>groundSegmentClear(port,points[Math.max(0,i-1)],p,radius));}
interface Traffic extends Point {hex:string;radius:number;time:number;}
const observations=new Map<string,Traffic>(),controlled=new Map<string,Traffic>();
export function updateGroundTraffic(rows:Aircraft[],now:number){observations.clear();for(const a of rows)if(!a.simulation&&a.ground&&a.lat!==null&&a.lon!==null&&a.observedAt!==null&&now-a.observedAt<30000&&now-a.observedAt>=-5000)observations.set(a.hex,{hex:a.hex,lat:a.lat,lon:a.lon,radius:aircraftRadius(a.aircraftType),time:now});}
export function forgetGroundTraffic(hex:string){controlled.delete(hex);}
export function resetGroundTraffic(){controlled.clear();observations.clear();}
export function publishGroundTraffic(hex:string,pose:Point&{ground:boolean},radius:number,now:number){if(pose.ground)controlled.set(hex,{...pose,hex,radius,time:now});else controlled.delete(hex);}
export function groundConflict(hex:string,port:AirportGeometry,from:Point,to:Point,radius:number,now:number){
 if(!groundSegmentClear(port,from,to,radius))return 'building clearance';
 const a=xy(from,port),b=xy(to,port);
 for(const traffic of [observations,controlled])for(const p of traffic.values()){if(p.hex===hex||now-p.time>(traffic===controlled?3000:30000))continue;if(distance(xy(p,port),a,b)<radius+p.radius+5)return 'aircraft separation';}
 return '';
}
/** A private presentation clock. Never edits the original received observation. */
export class GroundMotionClock {
 currentTime(){return this.time;}
 private real:number|null=null;private time=0;private rate=1;private checked=0;private blocked='';private escape:number|null=null;private airChecked=0;
 advance<T extends Point&{ground:boolean;groundSpeed?:number;heading?:number;altitude?:number}>(hex:string,now:number,port:AirportGeometry,radius:number,sample:(time:number)=>T):T&{groundHold?:string}{
  if(this.real===null){this.time=now;this.real=now;}
  const elapsed=Math.max(0,now-this.real),dt=Math.min(1000,elapsed);this.real=Math.max(this.real,now);
  const current=sample(this.time);
  if(!current.ground){
   if(this.escape===null&&current.altitude!==undefined&&current.altitude-(port.elevationFt??0)<2000&&now-this.airChecked>=1000){this.airChecked=now;for(let seconds=5;seconds<=45;seconds+=5){const future=sample(this.time+seconds*1000);if(future.ground){if(groundConflict(hex,port,future,future,radius,now))this.escape=0;break;}}}
   if(this.escape!==null){
    this.escape+=Math.min(1000,elapsed);const u=Math.min(1,this.escape/120000),theta=u*Math.PI*2,h=(current.heading??0)*Math.PI/180,speed=Math.max(45,(current.groundSpeed??120)*.514444),r=speed*120/(2*Math.PI),forward=r*Math.sin(theta),right=r*(1-Math.cos(theta));
    const diverted={...current,lon:current.lon+(Math.sin(h)*forward+Math.cos(h)*right)/(111120*Math.max(.01,Math.cos(current.lat*Math.PI/180))),lat:current.lat+(Math.cos(h)*forward-Math.sin(h)*right)/111120,heading:((current.heading??0)+u*360)%360,altitude:(current.altitude??0)+1500*Math.sin(Math.PI*u)**2,phase:'go-around · runway occupied',bank:Math.atan(speed*(2*Math.PI/120)/9.81)*180/Math.PI,pitch:Math.atan(1500*Math.PI/120*Math.sin(2*Math.PI*u)*.3048/speed)*180/Math.PI,arrivalGoAround:true};
    if(u>=1){this.escape=null;this.airChecked=0;}publishGroundTraffic(hex,diverted,radius,now);return diverted;
   }
   this.time+=elapsed;this.rate=1;const next=sample(this.time);publishGroundTraffic(hex,next,radius,now);return next;
  }
  if(now-this.checked>=100||this.checked===0){this.checked=now;this.blocked='';let prior=current;const horizon=Math.max(4,(current.groundSpeed??0)*.514444/2+2);for(let i=1;i<=8;i++){const next=sample(this.time+i*horizon*1000/8);if(next.ground){this.blocked=groundConflict(hex,port,prior,next,radius,now);if(this.blocked)break;}prior=next;}}
  const speed=Math.max(1,(current.groundSpeed??0)*.514444),change=2*dt/1000/speed;
  this.rate=this.blocked?Math.max(0,this.rate-change):Math.min(1,this.rate+change*.5);
  const next=sample(this.time+dt*this.rate),conflict=next.ground?groundConflict(hex,port,current,next,radius,now):'';
  if(!conflict)this.time+=dt*this.rate;else this.rate=0;
  const result=conflict?current:next;publishGroundTraffic(hex,result,radius,now);
  return {...result,groundSpeed:(result.groundSpeed??0)*this.rate,groundHold:conflict||this.blocked||undefined};
 }
}
