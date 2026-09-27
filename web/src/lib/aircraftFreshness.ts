import type {Aircraft,TrailPoint} from '../types.ts';
import {liveFrame} from './liveMotion.ts';
export const STALE_AFTER_MS=120000;
export function staleAircraft(a:Aircraft,now:number){return a.observedAt===null||!Number.isFinite(a.observedAt)||now-a.observedAt>STALE_AFTER_MS||a.observedAt>now+5000;}
export function aircraftFreshness(a:Aircraft,points:TrailPoint[],now:number,reduced=false){
 const frame=liveFrame(a,points,now,reduced);
 if(frame?.estimated)return {state:'estimated',label:`Estimated movement${staleAircraft(a,now)?' · stale fix; uncertainty increasing':''}${a.positionWarning?' · suspect update excluded':''}`,color:staleAircraft(a,now)?'#e5b97b':'#bba9ef'};
 if(a.positionWarning)return {state:'suspect',label:'Position quality · '+a.positionWarning,color:'#e5b97b'};
 if(staleAircraft(a,now))return {state:'stale',label:'Stale · last observed position',color:'#e5b97b'};
 if(reduced||a.ground)return {state:'snapshot',label:reduced?'Snapshot · reduced motion':'Reported on ground',color:'#b9ced9'};
 return {state:'waiting',label:'No movement estimate · speed or heading unavailable',color:'#e5b97b'};
}
