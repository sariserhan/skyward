import type {Aircraft} from '../types.ts';
import {distanceNm,type LocalEvent} from './experience.ts';
export interface AlertDestination {id:string;lat:number;lon:number;callsign:string;loadedAt:number;}
/** Uses received positions only. A route endpoint is a candidate, not an arrival confirmation. */
export function destinationAlert(before:Aircraft|undefined,a:Aircraft,d:AlertDestination|undefined,now:number):LocalEvent|null{
 if(!before||!d||before.callsign!==a.callsign||d.callsign!==a.callsign||now-d.loadedAt>30*60000||a.targetKind!=='aircraft'||a.ground||a.positionWarning||a.observedAt===null||before.observedAt===null||a.observedAt<=before.observedAt||a.observedAt-before.observedAt>120000||now-a.observedAt>30000||a.observedAt>now+1000||![a.lat,a.lon,before.lat,before.lon].every(v=>v!==null&&Number.isFinite(v)))return null;
 const distance=distanceNm(a.lat!,a.lon!,d.lat,d.lon),prior=distanceNm(before.lat!,before.lon!,d.lat,d.lon);
 if(distance>30||prior<=30||distance>=prior||(a.verticalRate??0)>=-150)return null;
 return {id:`${a.hex}-destination-${a.observedAt}`,hex:a.hex,time:now,title:`${a.callsign||a.hex}: approaching route destination ${d.id} · inferred from received fixes; arrival unconfirmed`};
}
