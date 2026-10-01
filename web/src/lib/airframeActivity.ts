import type {AirframeObservation} from './airframeObservations';
export type ActivityType='FIRST_SEEN'|'AIRBORNE'|'GROUND'|'REAPPEARED'|'REGISTRATION_CHANGED'|'ICAO_CHANGED';
export type ActivityEvent={type:ActivityType;at:number;registration:string;source:string};
export type ActivityState={last:AirframeObservation|null;stableGround?:boolean;candidate?:{ground:boolean;at:number};events:ActivityEvent[]};
export const emptyActivity=():ActivityState=>({last:null,events:[]});
/** Feed observations only. AIRBORNE/GROUND are not confirmed departure/arrival events. */
export function observeActivity(state:ActivityState,row:AirframeObservation,source:string,now=Date.now()):ActivityState{
 if(now-row.observedAt>120000||row.observedAt>now+30000||row.observedAt<=0||state.last&&row.observedAt<=state.last.observedAt)return state;
 const next:ActivityState={...state,last:row,events:[...state.events]};
 const add=(type:ActivityType)=>{if(!next.events.some(e=>e.type===type&&row.observedAt-e.at<600000))next.events.push({type,at:row.observedAt,registration:row.registration,source:source.slice(0,160)});};
 if(!state.last){add('FIRST_SEEN');next.stableGround=row.ground;}
 else {
  const gap=row.observedAt-state.last.observedAt;
  if(gap>=1800000){add('REAPPEARED');next.stableGround=row.ground;delete next.candidate;}
  if(row.registration!==state.last.registration)add('REGISTRATION_CHANGED');
  if(row.hex!==state.last.hex)add('ICAO_CHANGED');
  if(gap<1800000&&typeof row.ground==='boolean'){
   if(next.stableGround===undefined)next.stableGround=row.ground;
   else if(row.ground===next.stableGround)delete next.candidate;
   else if(state.candidate?.ground===row.ground&&row.observedAt-state.candidate.at>=30000){add(row.ground?'GROUND':'AIRBORNE');next.stableGround=row.ground;delete next.candidate;}
   else if(state.candidate?.ground!==row.ground)next.candidate={ground:row.ground,at:row.observedAt};
  }else if(row.ground===undefined)delete next.candidate;
 }
 next.events=next.events.filter(e=>now-e.at<86400000).slice(-50);return next;
}
export const activityLabel:Record<ActivityType,string>={FIRST_SEEN:'First observed in this session',AIRBORNE:'Airborne state confirmed by repeated observations',GROUND:'Ground state confirmed by repeated observations',REAPPEARED:'Observed again after a coverage gap',REGISTRATION_CHANGED:'Observed registration changed',ICAO_CHANGED:'Observed ICAO address changed'};
