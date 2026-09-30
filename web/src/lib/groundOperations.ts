import {groundSegmentClear,groundConflict} from './groundSafety.ts';
import type {AirportGeometry,Aircraft} from '../types.ts';
import {planTaxi,taxiFrame,taxiSpeedProfile,type TaxiRoute} from './taxiRoute.ts';
import {runwayFrame} from './flightPresentation.ts';
import {trackDistance} from './positionQuality.ts';
export type GroundPhase='taxi in'|'gate service'|'pushback'|'taxi out'|'takeoff'|'complete';
export interface GroundPlan {inbound:TaxiRoute;outbound:TaxiRoute;runway:AirportGeometry['runways'][number];taxiSeconds:number;outboundSeconds:number;end:number;}
export function groundPlan(port:AirportGeometry,clearance=30):GroundPlan|null{
 for(const runway of port.runways){const route=planTaxi(port,{lon:runway.a[0],lat:runway.a[1]},{lon:runway.b[0],lat:runway.b[1]},clearance);if(!route)continue;
 const points=[...route.points].reverse(),meters=[...route.meters].reverse().map(n=>route.length-n),outbound={...route,points,meters,stop:points[0]};
 const taxiSeconds=taxiSpeedProfile(route).times.at(-1)!,outboundSeconds=taxiSpeedProfile(outbound).times.at(-1)!;
 return {inbound:route,outbound,runway,taxiSeconds,outboundSeconds,end:taxiSeconds+outboundSeconds+93.75};
 }return null;
}
export function groundFrame(plan:GroundPlan,time:number){
 const t=Math.max(0,time),arrival=taxiFrame(plan.inbound,Math.min(t,plan.taxiSeconds)),serviceStart=plan.taxiSeconds,departStart=serviceStart+30;
 if(t<serviceStart)return {...arrival,phase:'taxi in' as GroundPhase,altitude:0,pitch:0};
 if(t<departStart)return {...arrival,phase:'gate service' as GroundPhase,altitude:0,pitch:0,groundSpeed:0};
 const outTime=t-departStart,u=Math.max(0,Math.min(1,(outTime-20)/10)),travel=outTime<20?outTime/4:outTime<30?5+2.5*u+3.75*u*u:outTime-18.75,reverse=taxiFrame(plan.outbound,travel);
 if(outTime<20){const back=taxiFrame(plan.outbound,outTime/4);return {...back,heading:arrival.heading,phase:'pushback' as GroundPhase,groundSpeed:3,altitude:0,pitch:0};}
 if(outTime<plan.outboundSeconds+18.75)return {...reverse,heading:outTime<30?arrival.heading+(((reverse.heading-arrival.heading+540)%360)-180)*u*u*(3-2*u):reverse.heading,phase:'taxi out' as GroundPhase,altitude:0,pitch:0};
 const fraction=Math.min(1,(outTime-plan.outboundSeconds-18.75)/45),r={...plan.runway,b:plan.runway.a,a:[plan.inbound.stop.lon,plan.inbound.stop.lat] as [number,number]},f=runwayFrame(r,'takeoff',fraction);
 return {...f,groundSpeed:220*fraction,gate:plan.inbound.gate,parked:false,phase:(fraction>=1?'complete':'takeoff') as GroundPhase};
}
export function onRunway(point:{lon:number;lat:number},port:AirportGeometry,margin=25){
 return port.runways.some(r=>{const c=Math.cos(port.lat*Math.PI/180),dx=(r.b[0]-r.a[0])*111120*c,dy=(r.b[1]-r.a[1])*111120,x=(point.lon-r.a[0])*111120*c,y=(point.lat-r.a[1])*111120,L=Math.hypot(dx,dy);if(!L)return false;const along=(x*dx+y*dy)/L;return along>=-margin&&along<=L+margin&&Math.abs(x*dy-y*dx)/L<=Math.max(15,r.width/2)+margin;});
}
export function groundHold(proposed:{lon:number;lat:number},others:{lon:number;lat:number}[],port:AirportGeometry,observations:Aircraft[],now:number,previous=proposed){
 const conflict=groundConflict('ground-demo-plane',port,previous,proposed,30,now);if(conflict)return conflict==='building clearance'?'Building clearance':'Taxi separation';
 if(!groundSegmentClear(port,previous,proposed))return 'Building clearance';
 if(others.some(p=>trackDistance(p,proposed)*1852<65))return 'Taxi separation';
 if(onRunway(proposed,port)&&observations.some(a=>a.lat!==null&&a.lon!==null&&a.observedAt!==null&&now-a.observedAt<=30000&&now-a.observedAt>=-5000&&(a.ground||(a.altitude??Infinity)-(port.elevationFt??0)<500)&&onRunway(a as {lat:number;lon:number},port)))return 'Runway occupied by a recent observation';
 return '';
}