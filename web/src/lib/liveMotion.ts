import {predictedLanding,type LandingPhase} from './landingPrediction.ts';
import type {Aircraft,TrailPoint,FlightRoute,AirportGeometry} from '../types.ts';
import {bearing} from './flightPresentation.ts';
import {contiguous,trackDistance} from './positionQuality.ts';
const wrap=(n:number)=>((n+540)%360+360)%360-180;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export interface LiveFrame {lon:number;lat:number;altitude:number;heading:number;time:number;ground:boolean;estimated:boolean;age:number;turnRate?:number;verticalRate?:number;correcting?:boolean;predictionLimited?:boolean;landingPhase?:LandingPhase;runway?:string;groundSpeed?:number;pitch?:number;}
function destination(lat:number,lon:number,heading:number,nm:number){
 const r=Math.PI/180,p=lat*r,l=lon*r,h=heading*r,d=nm/3440.065;
 const y=Math.asin(Math.max(-1,Math.min(1,Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(h))));
 return {lat:y/r,lon:wrap((l+Math.atan2(Math.sin(h)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(y)))/r)};
}
/** Display-only dead reckoning. Never write the result to observation/history stores. */
export function liveFrame(a:Aircraft,points:TrailPoint[],now:number,reduced=false,route?:FlightRoute|null,arrivalGeometry?:AirportGeometry|null):LiveFrame|null{
 if(!finite(now)||!finite(a.lat)||!finite(a.lon)||Math.abs(a.lat)>90||Math.abs(a.lon)>180||!finite(a.observedAt)||a.observedAt>now+5000)return null;
 const age=Math.max(0,now-a.observedAt),frame:LiveFrame={lat:a.lat,lon:a.lon,altitude:finite(a.altitude)?a.altitude:0,heading:finite(a.heading)?a.heading:0,time:a.observedAt,ground:a.ground,estimated:false,age};
 if(reduced||a.ground||(a.targetKind&&a.targetKind!=='aircraft'))return frame;
 const landing=predictedLanding(a,now,route,arrivalGeometry);if(landing)return landing;
 let speed=finite(a.groundSpeed)&&a.groundSpeed>0&&a.groundSpeed<=1200?a.groundSpeed:null;
 let heading=finite(a.heading)&&a.heading>=0&&a.heading<=360?a.heading:null;
 const last=points.at(-1),previous=points.at(-2);
 if(last&&previous&&last.time===a.observedAt&&!last.ground&&!previous.ground&&contiguous(previous,last)){
  const distance=trackDistance(previous,last),derived=distance*3600000/(last.time-previous.time);
  if(distance>.001&&derived>0&&derived<=1200){speed??=derived;heading??=bearing(previous,last);}
 }
 if(speed===null||heading===null)return frame;
 // Infer short-lived turn trends only from three continuous, recent segments.
 let turnRate=0;const older=points.at(-3);
 if(older&&previous&&last&&last.time===a.observedAt&&contiguous(older,previous)&&contiguous(previous,last)&&!older.ground&&!previous.ground&&!last.ground){
  const dt1=(previous.time-older.time)/1000,dt2=(last.time-previous.time)/1000;
  if(dt1>=5&&dt2>=5&&dt1<=60&&dt2<=60&&trackDistance(older,previous)>.01&&trackDistance(previous,last)>.01)turnRate=Math.max(-1.5,Math.min(1.5,wrap(bearing(previous,last)-bearing(older,previous))/((dt1+dt2)/2)));
 }
 // Short gaps can be animated; stale approaches must not fly on indefinitely.
 const approaching=frame.altitude<8000||(finite(a.verticalRate)&&a.verticalRate<-300);
 let limit=approaching?30:120;
 // A plausible destination can shorten prediction, never steer or manufacture a landing.
 const arrival=route?.status==='PLAUSIBLE'&&route.callsign===a.callsign&&route.airports.length===2?route.airports[1]:null;
 if(approaching&&arrival){const distance=trackDistance(frame,arrival);if(distance<20)limit=Math.min(limit,Math.max(0,distance-1)*3600/speed);}
 const seconds=Math.min(age/1000,limit),trendSeconds=Math.min(30,seconds);
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
 const altitude=frame.altitude>2000&&frame.altitude<60000?frame.altitude+Math.max(-Math.min(1500,frame.altitude-1500),Math.min(1500,60000-frame.altitude,delta)):frame.altitude;
 return {...frame,...position,altitude,heading:bearing(position,next),estimated:age>0,predictionLimited:age>0&&age/1000>=limit,turnRate:turnRate*(1-trendSeconds/30),verticalRate:vertical*(1-trendSeconds/30)};
}
export function liveMotionStatus(a:Aircraft,points:TrailPoint[],now:number,reduced=false,route?:FlightRoute|null,arrivalGeometry?:AirportGeometry|null){
 if(reduced)return 'Reduced motion · showing received positions';
 if(a.ground)return 'Live · reported on ground';
 const frame=liveFrame(a,points,now,false,route,arrivalGeometry);
 if(!frame)return 'Position unavailable · cannot estimate movement';
 if(frame.landingPhase)return `Predicted landing · ${frame.landingPhase==='approach'?'final approach':frame.landingPhase==='rollout'?'rollout':'rollout complete'} · runway ${frame.runway}`;
 if(frame.predictionLimited)return `Awaiting live position · prediction paused. Last observed ${Math.floor(frame.age/1000)}s ago; arrival unconfirmed.`;
 if(!frame.estimated)return 'Live position';
 return `${frame.age>30000?'Predicted motion':'Live tracking'} · ${Math.floor(frame.age/1000)}s since update`;
}
/** Smooth incoming corrections while the extrapolated destination keeps moving. */
export class LiveMotion {
 private frames=new Map<string,{signature:string;frame:LiveFrame;start:number;dx:number;dy:number;dz:number;dh:number}>();
 sample(a:Aircraft,points:TrailPoint[],now:number,reduced=false,route?:FlightRoute|null,arrivalGeometry?:AirportGeometry|null){
  const target=liveFrame(a,points,now,reduced,route,arrivalGeometry);if(!target)return null;
  if(reduced||a.ground||(!target.estimated&&target.age>0)){this.frames.delete(a.hex);return target;}
  const signature=[a.observedAt,a.lat,a.lon,a.altitude,a.groundSpeed,a.heading,a.verticalRate,!!target.landingPhase].join('/');
  let state=this.frames.get(a.hex);
  if(!state)state={signature,frame:target,start:now,dx:0,dy:0,dz:0,dh:0};
  else if(state.signature!==signature)state={signature,frame:state.frame,start:now,dx:wrap(state.frame.lon-target.lon),dy:state.frame.lat-target.lat,dz:state.frame.altitude-target.altitude,dh:wrap(state.frame.heading-target.heading)};
  const t=Math.max(0,Math.min(1,(now-state.start)/2000)),remaining=1-t*t*(3-2*t);
  const frame={...target,lon:wrap(target.lon+state.dx*remaining),lat:Math.max(-90,Math.min(90,target.lat+state.dy*remaining)),altitude:target.altitude+state.dz*remaining,heading:(target.heading+state.dh*remaining+360)%360,correcting:remaining>0&&(Math.abs(state.dx)+Math.abs(state.dy)+Math.abs(state.dz))>0.00001};
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
