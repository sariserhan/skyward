import {runwayFrame} from './flightPresentation.ts';
import {groundFrame,type GroundPlan} from './groundOperations.ts';
/** Optional synthetic tower show; never used as an observation or a gate assignment. */
export function towerCycle(plan:GroundPlan,time:number){
 if(time<45){const a=plan.runway.a,stop=plan.inbound.stop,r={...plan.runway,b:[a[0]+(stop.lon-a[0])/.85,a[1]+(stop.lat-a[1])/.85] as [number,number]},f=runwayFrame(r,'landing',Math.max(0,time)/45);return {...f,phase:time<22.5?'landing':'rollout',groundSpeed:Math.max(0,140*(1-time/45)),gate:plan.inbound.gate};}
 const elapsed=time-45,t=elapsed<3?elapsed*elapsed/6:elapsed-1.5;
 return groundFrame(plan,t);
}

/** Independent runway demonstrations do not need, or fabricate, a taxi route. */
export function runwayDemonstration(runway:GroundPlan['runway'],mode:'landing'|'takeoff',time:number){
 const fraction=Math.max(0,Math.min(1,time/45)),frame=runwayFrame(runway,mode,fraction);
 return {...frame,phase:fraction>=1?'complete':mode==='landing'&&fraction>=.5?'rollout':mode,groundSpeed:mode==='landing'?140*(1-fraction):220*fraction};
}
export function usableDemoRunway(runway:GroundPlan['runway']|undefined){
 return !!runway&&runway.length>100&&[...runway.a,...runway.b].every(Number.isFinite)&&Math.abs(runway.a[0])<=180&&Math.abs(runway.b[0])<=180&&Math.abs(runway.a[1])<=90&&Math.abs(runway.b[1])<=90&&(runway.a[0]!==runway.b[0]||runway.a[1]!==runway.b[1]);
}
