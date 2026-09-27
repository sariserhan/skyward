import type {Aircraft,TrailPoint} from '../types.ts';
import {movement} from './exploration.ts';
export function spotterCandidates(rows:Aircraft[],histories:Map<string,TrailPoint[]>,airport:string,now:number){return rows.flatMap(a=>{if(a.targetKind!=='aircraft'||a.observedAt===null||a.observedAt>now+5000)return [];const m=movement(a,histories.get(a.hex)??[],airport,now);return m?.direction==='Approaching'?[{aircraft:a,distance:m.distance}]:[];}).sort((a,b)=>a.distance-b.distance);}
