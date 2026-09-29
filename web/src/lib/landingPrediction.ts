import {arrivalParking} from './arrivalParking.ts';
import {landingRouteMode} from './landingRoute.ts';
import {planTaxi,taxiFrame} from './taxiRoute.ts';
import type {Aircraft,AirportGeometry,FlightRoute} from '../types.ts';
import {bearing} from './flightPresentation.ts';
const radians=Math.PI/180;
const wrap=(n:number)=>((n+540)%360+360)%360-180;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
type Point={x:number;y:number};
const approachArcs=new WeakMap<AirportGeometry,Map<string,number[]>>();
export type LandingPhase='approach'|'rollout'|'stopped'|'taxi'|'parked';
/** A presentation trajectory only. Never persist this as an aircraft observation. */
export function predictedLanding(a:Aircraft,now:number,route:FlightRoute|null|undefined,airport:AirportGeometry|null|undefined,completeArrival=false){
 if(!airport||!Number.isFinite(airport.elevationFt)||a.ground||a.positionWarning||a.targetKind!=='aircraft')return null;
 const mode=landingRouteMode(a.callsign,route,airport);if(!mode)return null;
 const inferred=mode==='inferred';
 if(![a.lat,a.lon,a.altitude,a.observedAt,a.heading,a.groundSpeed,now].every(v=>typeof v==='number'&&Number.isFinite(v)))return null;
 const age=(now-a.observedAt!)/1000,rawAgl=a.altitude!-airport.elevationFt!,agl=Math.max(0,rawAgl);
 if(age<0||rawAgl< -200||agl>6000||a.groundSpeed!<60||a.groundSpeed!>260||(a.verticalRate!==null&&a.verticalRate>150))return null;
 if(inferred&&(agl>3000||typeof a.verticalRate!=='number'||!Number.isFinite(a.verticalRate)||a.verticalRate>=-150))return null;
 const lon0=airport.lon,lat0=airport.lat,cos=Math.cos(lat0*radians);
 if(Math.abs(cos)<.01)return null;
 const local=(lon:number,lat:number):Point=>({x:wrap(lon-lon0)*cos*60,y:(lat-lat0)*60});
 const geo=(p:Point)=>({lon:wrap(lon0+p.x/(60*cos)),lat:lat0+p.y/60});
 const p0=local(a.lon!,a.lat!);let best:{score:number;start:Point;end:Point;touch:Point;heading:number;length:number;id:string}|null=null;
 for(const runway of airport.runways){
  if(runway.length<(a.groundSpeed!>120?1400:600))continue;
  for(const reverse of [false,true]){
   const from=reverse?runway.b:runway.a,to=reverse?runway.a:runway.b;
   if(![...from,...to].every(Number.isFinite))continue;
   const start=local(...from),end=local(...to),length=Math.hypot(end.x-start.x,end.y-start.y);
   if(length<.25)continue;
   const heading=bearing(geo(start),geo(end)),ux=(end.x-start.x)/length,uy=(end.y-start.y)/length;
   const along=(p0.x-start.x)*ux+(p0.y-start.y)*uy,cross=Math.abs((p0.x-start.x)*uy-(p0.y-start.y)*ux);
   const headingError=Math.abs(wrap(a.heading!-heading));
   // A fresh low fix can already be past the usual touchdown marker. Keep the
   // target ahead, with room to roll out, rather than flying through the airport.
   const overRunway=along>=0&&along<length*.65&&cross<Math.max(.025,runway.width/1852)&&agl<=180;
   const offset=overRunway?Math.min(length*.72,Math.max(Math.min(.18,length*.15),along+Math.max(.04,agl/900))):Math.min(.18,length*.15);
   const touch={x:start.x+ux*offset,y:start.y+uy*offset};
   const distance=Math.hypot(touch.x-p0.x,touch.y-p0.y),alignment=Math.abs(wrap(bearing(geo(p0),geo(touch))-heading));
   // Reject departures, go-arounds, overflights, and fixes beyond the runway.
   if(distance>12||headingError>(overRunway?15:35)||(!overRunway&&alignment>30)||agl>distance*650+300)continue;
   if(inferred&&(distance>6||headingError>15||(!overRunway&&alignment>12)))continue;
   const score=headingError+alignment+distance;
   if(!best||score<best.score)best={score,start,end,touch,heading,length,id:reverse?runway.id.split('/')[1]??runway.id:runway.id.split('/')[0]};
  }
 }
 if(!best)return null;
 const {touch,heading,length,start,end,id}=best,dist=Math.hypot(touch.x-p0.x,touch.y-p0.y);
 const touchdownSpeed=clamp(a.groundSpeed!*.85,60,155);
 const p1={x:p0.x+Math.sin(a.heading!*radians)*dist/3,y:p0.y+Math.cos(a.heading!*radians)*dist/3};
 const p2={x:touch.x-Math.sin(heading*radians)*Math.min(dist/3,.65),y:touch.y-Math.cos(heading*radians)*Math.min(dist/3,.65)};
 const curve=(t:number)=>{const u=1-t;return {x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*touch.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*touch.y};};
 const segments=256,key=[a.hex,a.observedAt,a.lat,a.lon,a.heading,a.groundSpeed,id].join('/');
 let arcs=approachArcs.get(airport);if(!arcs){arcs=new Map();approachArcs.set(airport,arcs);}let arc=arcs.get(key);
 if(!arc){arc=[0];let prior=p0;for(let i=1;i<=segments;i++){const p=curve(i/segments);arc.push(arc[i-1]+Math.hypot(p.x-prior.x,p.y-prior.y));prior=p;}arcs.set(key,arc);while(arcs.size>256)arcs.delete(arcs.keys().next().value!);}
 const pathLength=arc[segments],approachSeconds=pathLength/((a.groundSpeed!+touchdownSpeed)/2)*3600;
 const base={time:a.observedAt!,age:age*1000,estimated:true as const,predictionLimited:false,runway:id};
 if(age<approachSeconds){
  const elapsed=clamp(age/approachSeconds,0,1);
  const traveled=approachSeconds/3600*(a.groundSpeed!*elapsed+(touchdownSpeed-a.groundSpeed!)*elapsed*elapsed/2);
  let segment=1;while(segment<segments&&arc[segment]<traveled)segment++;
  const t=(segment-1+(traveled-arc[segment-1])/(arc[segment]-arc[segment-1]))/segments,u=1-t;
  const p={x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*touch.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*touch.y};
  const dx=3*u*u*(p1.x-p0.x)+6*u*t*(p2.x-p1.x)+3*t*t*(touch.x-p2.x),dy=3*u*u*(p1.y-p0.y)+6*u*t*(p2.y-p1.y)+3*t*t*(touch.y-p2.y);
  const slope=clamp((a.verticalRate??-700)/60*approachSeconds,-2*agl,0);
  const h=elapsed;const height=Math.max(0,(2*h*h*h-3*h*h+1)*agl+(h*h*h-2*h*h+h)*slope);
  return {...base,...geo(p),altitude:airport.elevationFt!+height,ground:false,heading:(Math.atan2(dx,dy)/radians+360)%360,pitch:2+2*elapsed*elapsed*(3-2*elapsed),groundSpeed:a.groundSpeed!+(touchdownSpeed-a.groundSpeed!)*elapsed,landingPhase:'approach' as LandingPhase};
 }
 const proposedTaxi=planTaxi(airport,geo(start),geo(end))??(completeArrival?arrivalParking(airport,geo(start),geo(end)):null);
 const touchAlong=((touch.x-start.x)*(end.x-start.x)+(touch.y-start.y)*(end.y-start.y))/length;
 const taxiStop=proposedTaxi?local(proposedTaxi.stop.lon,proposedTaxi.stop.lat):null;
 // Never reverse along the runway to reach an exit behind a late touchdown.
 const taxi=taxiStop&&((taxiStop.x-start.x)*(end.x-start.x)+(taxiStop.y-start.y)*(end.y-start.y))/length>touchAlong+.08?proposedTaxi:null;
 const stop=taxi?local(taxi.stop.lon,taxi.stop.lat):{x:start.x+(end.x-start.x)*.85,y:start.y+(end.y-start.y)*.85},rollDistance=Math.hypot(stop.x-touch.x,stop.y-touch.y);
 const exitSpeed=taxi?taxiFrame(taxi,0).groundSpeed:0,rollSeconds=2*rollDistance/(touchdownSpeed+exitSpeed)*3600,t=clamp((age-approachSeconds)/rollSeconds,0,1),progress=(touchdownSpeed*t+(exitSpeed-touchdownSpeed)*t*t/2)/((touchdownSpeed+exitSpeed)/2);
 if(taxi&&age>=approachSeconds+rollSeconds){const ground=taxiFrame(taxi,age-approachSeconds-rollSeconds);return {...base,...ground,altitude:airport.elevationFt!,ground:true,pitch:0,landingPhase:(ground.parked?'parked':'taxi') as LandingPhase};}
 return {...base,...geo({x:touch.x+(stop.x-touch.x)*progress,y:touch.y+(stop.y-touch.y)*progress}),altitude:airport.elevationFt!,ground:true,heading,pitch:4*(1-Math.min(1,(age-approachSeconds)/4)**2*(3-2*Math.min(1,(age-approachSeconds)/4))),groundSpeed:touchdownSpeed+(exitSpeed-touchdownSpeed)*t,landingPhase:(t<1?'rollout':'stopped') as LandingPhase};
}
