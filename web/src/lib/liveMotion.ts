import {syntheticFrame} from './syntheticTraffic.ts';
import {WatchedArrival} from './watchedArrival.ts';
import {predictedLanding,type LandingPhase} from './landingPrediction.ts';
import type {Aircraft,TrailPoint,FlightRoute,AirportGeometry} from '../types.ts';
import {bearing} from './flightPresentation.ts';
import {contiguous,trackDistance} from './positionQuality.ts';
const wrap=(n:number)=>((n+540)%360+360)%360-180;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export interface LiveFrame { simulated?:boolean;simulationElevationFt?:number;gear?:number;arrivalAnimation?:boolean;arrivalElevationFt?:number;arrivalRejoin?:boolean;lon:number;lat:number;altitude:number;heading:number;time:number;ground:boolean;groundClearance?:number;estimated:boolean;age:number;turnRate?:number;verticalRate?:number;correcting?:boolean;predictionLimited?:boolean;landingPhase?:LandingPhase;runway?:string;groundSpeed?:number;pitch?:number;gate?:string;}
function destination(lat:number,lon:number,heading:number,nm:number){
 const r=Math.PI/180,p=lat*r,l=lon*r,h=heading*r,d=nm/3440.065;
 const y=Math.asin(Math.max(-1,Math.min(1,Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(h))));
 return {lat:y/r,lon:wrap((l+Math.atan2(Math.sin(h)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(y)))/r)};
}
/** Display-only dead reckoning. Never write the result to observation/history stores. */
export function liveFrame(a:Aircraft,points:TrailPoint[],now:number,reduced=false,route?:FlightRoute|null,arrivalGeometry?:AirportGeometry|null):LiveFrame|null{
 if(a.simulation)return syntheticFrame(a,now);
 if(!finite(now)||!finite(a.lat)||!finite(a.lon)||Math.abs(a.lat)>90||Math.abs(a.lon)>180||!finite(a.observedAt)||a.observedAt>now+5000)return null;
 const age=Math.max(0,now-a.observedAt),frame:LiveFrame={lat:a.lat,lon:a.lon,altitude:finite(a.altitude)?a.altitude:0,heading:finite(a.heading)?a.heading:0,time:a.observedAt,ground:a.ground,estimated:false,age};
 if(reduced||(a.targetKind&&a.targetKind!=='aircraft'))return frame;
 if(a.ground){
  if(a.positionWarning||!finite(a.groundSpeed)||a.groundSpeed<2||a.groundSpeed>200||!finite(a.heading)||a.heading<0||a.heading>360)return frame;
  // Short ground prediction decelerates rather than driving indefinitely through buildings.
  let limit=8;
  if(a.groundSpeed>45){
   let remaining=0;
   for(const runway of arrivalGeometry?.runways??[]){
    for(const reverse of [false,true]){const from=reverse?runway.b:runway.a,to=reverse?runway.a:runway.b,heading=bearing({lon:from[0],lat:from[1]},{lon:to[0],lat:to[1]});if(Math.abs(wrap(a.heading-heading))>20)continue;
     const c=Math.cos(a.lat*Math.PI/180),dx=wrap(to[0]-from[0])*111120*c,dy=(to[1]-from[1])*111120,x=wrap(a.lon-from[0])*111120*c,y=(a.lat-from[1])*111120,L=Math.hypot(dx,dy),along=(x*dx+y*dy)/L,side=Math.abs(x*dy-y*dx)/L;
     if(along>=0&&along<L&&side<=Math.max(15,runway.width/2))remaining=Math.max(remaining,L-along-20);
    }
   }
   if(remaining<=0)return frame;limit=Math.min(8,2*remaining/(a.groundSpeed*.514444));
  }
  const t=Math.min(age/1000,limit),seconds=t-t*t/(2*limit),position=destination(a.lat,a.lon,a.heading,a.groundSpeed*seconds/3600);
  return {...frame,...position,groundSpeed:a.groundSpeed*(1-t/limit),estimated:age>0,predictionLimited:age>=limit*1000};
 }
 let speed=finite(a.groundSpeed)&&a.groundSpeed>0&&a.groundSpeed<=1200?a.groundSpeed:null;
 let heading=finite(a.heading)&&a.heading>=0&&a.heading<=360?a.heading:null;
 const last=points.at(-1),previous=points.at(-2);
 if(last&&previous&&last.time===a.observedAt&&!last.ground&&!previous.ground&&contiguous(previous,last)){
  const distance=trackDistance(previous,last),derived=distance*3600000/(last.time-previous.time);
  if(distance>.001&&derived>0&&derived<=1200){speed??=derived;heading??=bearing(previous,last);}
 }
 const landing=predictedLanding({...a,groundSpeed:speed,heading},now,route,arrivalGeometry);if(landing)return landing;
 if(speed===null||heading===null)return frame;
 // Infer short-lived turn trends only from three continuous, recent segments.
 let turnRate=0;const older=points.at(-3);
 if(older&&previous&&last&&last.time===a.observedAt&&contiguous(older,previous)&&contiguous(previous,last)&&!older.ground&&!previous.ground&&!last.ground){
  const dt1=(previous.time-older.time)/1000,dt2=(last.time-previous.time)/1000;
  if(dt1>=5&&dt2>=5&&dt1<=60&&dt2<=60&&trackDistance(older,previous)>.01&&trackDistance(previous,last)>.01)turnRate=Math.max(-1.5,Math.min(1.5,wrap(bearing(previous,last)-bearing(older,previous))/((dt1+dt2)/2)));
 }
 // Confidence expires, not animation. Continue display-only motion through outages.
 // Mapped, aligned approaches above use the landing trajectory instead of flying past it.
 const approaching=frame.altitude<8000||(finite(a.verticalRate)&&a.verticalRate<-300);
 const limit=approaching?30:120;
 const seconds=age/1000,trendSeconds=Math.min(30,seconds);
 const turn=(t:number)=>turnRate*(t-t*t/60);
 let position={lat:a.lat,lon:a.lon};
 if(turnRate){for(let t=0;t<trendSeconds;t+=5){const step=Math.min(5,trendSeconds-t);position=destination(position.lat,position.lon,heading+turn(t+step/2),speed*step/3600);}}
 else position=destination(a.lat,a.lon,heading,speed*trendSeconds/3600);
 const course=heading+turn(trendSeconds),rest=Math.max(0,seconds-trendSeconds),origin=position;
 position=destination(origin.lat,origin.lon,course,speed*rest/3600);
 const next=destination(origin.lat,origin.lon,course,speed*(rest+1)/3600);
 // Fade vertical speed to zero over 30 seconds; never simulate touchdown.
 const vertical=finite(a.verticalRate)&&Math.abs(a.verticalRate)<=6000?a.verticalRate:0;
 const delta=vertical/60*(trendSeconds-trendSeconds*trendSeconds/60);
 const altitude=frame.altitude<60000&&(frame.altitude>2000||vertical>0)?frame.altitude+Math.max(-Math.min(1500,Math.max(0,frame.altitude-1500)),Math.min(1500,60000-frame.altitude,delta)):frame.altitude;
 return {...frame,...position,altitude,heading:bearing(position,next),estimated:age>0,predictionLimited:age>0&&age/1000>=limit,turnRate:turnRate*(1-trendSeconds/30),verticalRate:vertical*(1-trendSeconds/30)};
}
export function liveMotionStatus(a:Aircraft,points:TrailPoint[],now:number,reduced=false,route?:FlightRoute|null,arrivalGeometry?:AirportGeometry|null,displayed?:LiveFrame|null){
 if(a.simulation)return 'Skyward · Simulated flight · '+(a.simulation.phase);
 if(displayed?.arrivalAnimation)return displayed.arrivalRejoin?'Arrival animation · turning to intercept final approach':`Arrival animation · ${displayed.landingPhase} · runway ${displayed.runway??'selected'}${displayed.gate?' · '+displayed.gate:''} · runway and stand unconfirmed`;
 if(reduced)return 'Reduced motion · showing received positions';
 if(a.ground)return now-(a.observedAt??0)>8000?'On ground · awaiting position update':'Ground tracking · short motion estimate';
 const frame=displayed??liveFrame(a,points,now,false,route,arrivalGeometry);
 if(!frame)return 'Position unavailable · cannot estimate movement';
 if(frame.landingPhase==='taxi'||frame.landingPhase==='parked')return `Predicted airport animation · ${frame.landingPhase==='taxi'?'taxiing toward':'parked near'} illustrative gate ${frame.gate??'unknown'} · assignment unconfirmed`;
 if(frame.landingPhase)return `Predicted landing · ${frame.landingPhase==='approach'?'final approach':frame.landingPhase==='rollout'?'rollout':'rollout complete'} · runway ${frame.runway}`;
 if(frame.predictionLimited)return `Extended predicted motion · awaiting live position. Last observed ${Math.floor(frame.age/1000)}s ago; arrival unconfirmed.`;
 if(!frame.estimated)return 'Live position';
 return `${frame.age>30000?'Predicted motion':'Live tracking'} · ${Math.floor(frame.age/1000)}s since update`;
}
/** Smooth incoming corrections while the extrapolated destination keeps moving. */
export class LiveMotion {
 private watchedArrival=new WatchedArrival();
 watch(hex:string){return this.watchedArrival.watch(hex);}
 arrivalLayout(hex:string){return this.watchedArrival.layout(hex);}
 stopArrival(hex:string){this.watchedArrival.stop(hex);}
 private approaches=new Map<string,{aircraft:Aircraft;airport:AirportGeometry}>();
 displayed(hex:string){return this.frames.get(hex)?.frame??null;}

 private frames=new Map<string,{signature:string;frame:LiveFrame;start:number;duration:number;verticalDuration:number;dx:number;dy:number;dz:number;dh:number}>();
 sample(a:Aircraft,points:TrailPoint[],now:number,reduced=false,route?:FlightRoute|null,arrivalGeometry?:AirportGeometry|null){
  if(a.simulation)return syntheticFrame(a,now);
  const controlled=!reduced?this.watchedArrival.sample(a,now,route,arrivalGeometry,this.frames.get(a.hex)?.frame):null;
  if(controlled){this.frames.set(a.hex,{signature:'controlled',frame:controlled,start:now,duration:2000,verticalDuration:2000,dx:0,dy:0,dz:0,dh:0});return controlled;}
  let target=liveFrame(a,points,now,reduced,route,arrivalGeometry);if(!target)return null;
  const anchor=this.approaches.get(a.hex);
  if(anchor&&!reduced&&arrivalGeometry?.id===anchor.airport.id&&a.callsign===anchor.aircraft.callsign&&a.targetKind==='aircraft'&&(a.groundSpeed===null||(a.groundSpeed>=0&&a.groundSpeed<=260))&&!a.ground&&!a.positionWarning&&(a.verticalRate??0)<=150&&a.altitude!==null&&a.lat!==null&&a.lon!==null&&a.observedAt!==null&&a.observedAt>=anchor.aircraft.observedAt!&&a.observedAt-anchor.aircraft.observedAt!<=120000){
   const continued=predictedLanding(anchor.aircraft,now,route,anchor.airport);
   const agl=a.altitude-anchor.airport.elevationFt!;
   // Once touchdown starts, noisy low airborne fixes must not restart final approach.
   // Keep the plan only while new observations still agree with this runway arrival.
   if(continued&&agl>=-200&&agl<=250&&trackDistance(a as {lat:number;lon:number},continued)<.65&&a.heading!==null&&Math.abs(wrap(a.heading-anchor.aircraft.heading!))<20&&(!target.landingPhase||continued.ground))target=continued;
  }
  if(!reduced&&target.landingPhase&&arrivalGeometry){
   if(!anchor||target.time===a.observedAt)this.approaches.set(a.hex,{aircraft:{...a},airport:arrivalGeometry});
  }else this.approaches.delete(a.hex);
  while(this.approaches.size>256)this.approaches.delete(this.approaches.keys().next().value!);
  if(reduced){this.frames.delete(a.hex);this.approaches.delete(a.hex);return target;}
  const signature=[a.observedAt,a.lat,a.lon,a.altitude,a.groundSpeed,a.heading,a.verticalRate,a.ground,!!target.landingPhase].join('/');
  let state=this.frames.get(a.hex);
  if(!state)state={signature,frame:target,start:now,duration:2000,verticalDuration:2000,dx:0,dy:0,dz:0,dh:0};
  else if(state.signature!==signature)state={signature,frame:state.frame,start:now,duration:state.frame.landingPhase&&!target.landingPhase&&(a.verticalRate??0)>150?2000:Math.max(2000,Math.min(state.frame.age>120000?30000:8000,trackDistance(state.frame,target)*1852/(a.ground?12:100)*1000)),verticalDuration:Math.max(2000,Math.min(90000,(target.ground?Math.max(0,state.frame.altitude-(arrivalGeometry?.elevationFt??target.altitude)):Math.abs(state.frame.altitude-target.altitude))*1.5/20*1000)),dx:wrap(state.frame.lon-target.lon),dy:state.frame.lat-target.lat,dz:state.frame.altitude-target.altitude,dh:wrap(state.frame.heading-target.heading)};
  const t=Math.max(0,Math.min(1,(now-state.start)/state.duration)),remaining=1-t*t*(3-2*t);
  const vt=Math.max(0,Math.min(1,(now-state.start)/state.verticalDuration)),verticalRemaining=1-vt*vt*(3-2*vt);
  const frame={...target,lon:wrap(target.lon+state.dx*remaining),lat:Math.max(-90,Math.min(90,target.lat+state.dy*remaining)),altitude:target.ground?target.altitude:target.altitude+state.dz*verticalRemaining,groundClearance:target.ground?Math.max(0,target.altitude+state.dz-(arrivalGeometry?.elevationFt??target.altitude))*verticalRemaining:0,heading:(target.heading+state.dh*remaining+360)%360,correcting:remaining>0&&(Math.abs(state.dx)+Math.abs(state.dy)+Math.abs(state.dz))>0.00001};
  state.frame=frame;this.frames.delete(a.hex);this.frames.set(a.hex,state);
  while(this.frames.size>4000)this.frames.delete(this.frames.keys().next().value!);
  return frame;
 }
}

/** Age-based UI indicator, not a statistically calibrated accuracy bound. */
export function predictionConfidence(a:Aircraft,now:number){
 const age=a.observedAt===null?Infinity:Math.max(0,(now-a.observedAt)/1000);
 const speed=finite(a.groundSpeed)&&a.groundSpeed>0?a.groundSpeed:450;
 return {age,level:age<=30?'Recent estimate':age<=120?'Aging estimate':'Low confidence',driftNm:Number.isFinite(age)?.1+speed*age/3600*(.1+Math.sin(Math.min(Math.PI/3,age/600))):null};
}

// Preserve the displayed pose when camera ownership switches between globe and flight view.
export const sharedLiveMotion=new LiveMotion();
