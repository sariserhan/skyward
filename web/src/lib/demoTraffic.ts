import type {AirportGeometry} from '../types.ts';
import {AIRPORTS} from './airportCatalog.ts';
import {arrivalParking} from './arrivalParking.ts';
import {taxiSpeedProfile} from './taxiRoute.ts';
import {groundPlan,groundFrame,type GroundPlan} from './groundOperations.ts';
import {towerCycle,usableDemoRunway} from './towerCycle.ts';
import {bearing} from './flightPresentation.ts';
export const DEMO_MODELS=['b737','a320','b787','regional','bizjet','turboprop'] as const;
export interface DemoFlight {id:string;name:string;model:typeof DEMO_MODELS[number];destination:string;offset:number;}
export function demoPlan(airport:AirportGeometry):GroundPlan|null{
 const mapped=groundPlan(airport);if(mapped)return mapped;
 const runway=airport.runways.find(usableDemoRunway);if(!runway)return null;
 const inbound=arrivalParking(airport,{lon:runway.a[0],lat:runway.a[1]},{lon:runway.b[0],lat:runway.b[1]}),points=[...inbound.points].reverse(),outbound={...inbound,points,meters:[...inbound.meters].reverse().map(n=>inbound.length-n),stop:points[0]};
 const taxiSeconds=taxiSpeedProfile(inbound).times.at(-1)!,outboundSeconds=taxiSpeedProfile(outbound).times.at(-1)!;
 return {inbound,outbound,runway,taxiSeconds,outboundSeconds,end:taxiSeconds+outboundSeconds+93.75};
}
export function demoFleet(airport:string,seed:number,plan:GroundPlan):DemoFlight[]{
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const destinations=Object.keys(AIRPORTS).filter(id=>id!==airport),cycle=plan.end+46.5+180;
 const offsets=[0,24,46.5+plan.taxiSeconds*.5,46.5+plan.taxiSeconds+12,46.5+plan.taxiSeconds+plan.outboundSeconds+55,plan.end+46.5+70];
 return offsets.map((offset,i)=>({id:`skyward-demo-${i}`,name:`SKYWARD ${101+i}`,model:DEMO_MODELS[Math.floor(random()*DEMO_MODELS.length)],destination:destinations[Math.floor(random()*destinations.length)],offset:Math.min(cycle-1,offset)}));
}
/** Fictional traffic stays outside Aircraft/FeedResponse and observed histories. */
export function demoFrame(plan:GroundPlan,time:number){
 const end=plan.end+46.5,cycle=end+180,t=((time%cycle)+cycle)%cycle;
 if(t<end){const f=towerCycle(plan,t);return {...f,ground:f.altitude<=0,phase:f.phase==='gate service'?'parked at gate':f.phase,gear:f.altitude<=0||f.phase!=='takeoff'?1:Math.max(0,1-f.altitude/800)};}
 // A closed demonstration circuit joins departure and arrival without teleporting.
 const a=groundFrame(plan,plan.end),b=towerCycle(plan,0),u=(t-end)/180,v=1-u;
 const control=(p:{lat:number;lon:number},heading:number)=>({lon:p.lon+Math.sin(heading*Math.PI/180)*.045/Math.max(.1,Math.cos(p.lat*Math.PI/180)),lat:p.lat+Math.cos(heading*Math.PI/180)*.045});
 const c=control(a,a.heading),d=control(b,b.heading+180),at=(x:number)=>{const y=1-x;return {lon:y*y*y*a.lon+3*y*y*x*c.lon+3*y*x*x*d.lon+x*x*x*b.lon,lat:y*y*y*a.lat+3*y*y*x*c.lat+3*y*x*x*d.lat+x*x*x*b.lat};};
 const p=at(u),next=at(Math.min(1,u+.0001));
 return {...p,altitude:a.altitude*v+b.altitude*u+2500*Math.sin(Math.PI*u)**2,heading:bearing(p,next),pitch:0,ground:false,groundSpeed:180,phase:'airborne',gate:plan.inbound.gate,gear:u>.85?Math.min(1,(u-.85)/.1):0};
}
