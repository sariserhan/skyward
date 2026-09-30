import {towerExchange,type DialogueContext} from './flightDialogue.ts';
/** Round-robin, phase-aware exchanges. Never accumulate a stale traffic backlog. */
export class TowerRadioPlanner {
 private heard=new Map<string,{phase:string;at:number}>();
 next(traffic:(DialogueContext&{identity:string})[],now:number){
  const present=new Set(traffic.map(t=>t.identity));
  for(const id of this.heard.keys())if(!present.has(id))this.heard.delete(id);
  const eligible=traffic.filter(t=>{const last=this.heard.get(t.identity);return !last||last.phase!==t.phase||now-last.at>=90000;});
  eligible.sort((a,b)=>(this.heard.get(a.identity)?.at??-Infinity)-(this.heard.get(b.identity)?.at??-Infinity));
  const next=eligible[0];if(!next)return [];
  this.heard.set(next.identity,{phase:next.phase,at:now});return towerExchange(next);
 }
}
export function towerRadioPhase(phase:string){
 if(['landing','approach','flare'].includes(phase))return 'approach';
 if(['touchdown','rollout','braking'].includes(phase))return 'rollout';
 if(['taxi','taxi in','taxi out','pushback'].includes(phase))return 'taxi';
 if(['gate service','parked','complete'].includes(phase))return 'parked';
 if(['takeoff','climb','departure'].includes(phase))return 'climb';
 return phase;
}
