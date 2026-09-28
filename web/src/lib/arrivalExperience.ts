import type {Aircraft,TrailPoint} from '../types.ts';
import type {LiveFrame} from './liveMotion.ts';
export function directedView(phase?:string){return phase==='approach'?'chase':phase==='taxi'||phase==='parked'?'bird':'side';}
export function journeyPhase(a:Aircraft,frame:LiveFrame|null,trail:TrailPoint[]){
 if(frame?.landingPhase)return {phase:frame.landingPhase==='approach'?'Descent':frame.landingPhase==='rollout'?'Arrival':frame.landingPhase==='parked'?'Parked':frame.landingPhase==='taxi'?'Taxi':'Arrival',basis:'Predicted animation'};
 if(a.ground)return {phase:(a.groundSpeed??0)>2?'Taxi':'On ground',basis:'Reported ground state'};
 if((a.verticalRate??0)>300)return {phase:'Departure / climb',basis:'Inferred from reported climb'};
 if((a.verticalRate??0)<-300)return {phase:'Descent',basis:'Inferred from reported descent'};
 return {phase:a.altitude!==null&&a.altitude>18000?'Cruise':'Airborne',basis:trail.length?'Inferred from observed track':'Reported airborne state'};
}
/** Illustrative family layouts, not registration-specific mechanical models. */
export function gearLayout(type:string){
 const t=type.toUpperCase();
 if(/^B77/.test(t))return {axles:3,paired:true};
 if(/^(B74|A38|A33|A34|A35|B76|B78)/.test(t))return {axles:2,paired:true};
 return {axles:1,paired:! /^(C[12567]|PC|PA|SR|BE)/.test(t)};
}
export function detailBudget(quality:string,frameMs:number){const base=quality==='low'?3:quality==='high'?10:6;return frameMs>45?Math.min(2,base):frameMs>28?Math.min(4,base):base;}
