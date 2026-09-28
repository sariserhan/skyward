import type {Aircraft,TrailPoint} from '../types.ts';
import {AIRPORTS} from './airportCatalog.ts';
import {movement} from './exploration.ts';
import {trackDistance} from './positionQuality.ts';
export type ActivityMode='arrivals'|'departures'|'ground';
export function activityCandidates(rows:Aircraft[],histories:Map<string,TrailPoint[]>,airport:string,now:number,mode:ActivityMode){
 const port=AIRPORTS[airport];if(!port)return [];
 return rows.flatMap(a=>{if(a.targetKind!=='aircraft'||a.lat===null||a.lon===null||a.observedAt===null||now-a.observedAt>60000||a.observedAt>now+5000)return [];
 const distance=trackDistance(a as {lat:number;lon:number},port);
 if(mode==='ground')return a.ground&&distance<5?[{aircraft:a,distance}]:[];
 const m=movement(a,histories.get(a.hex)??[],airport,now);return m?.direction===(mode==='arrivals'?'Approaching':'Moving away')?[{aircraft:a,distance}]:[];
 }).sort((a,b)=>a.distance-b.distance);
}
/** Suggestions only from recent received positions; no speculative coverage or new requests. */
export function nearbyTraffic(rows:Aircraft[],center:{lat:number;lon:number},now:number){
 const recent=rows.filter(a=>a.targetKind==='aircraft'&&a.lat!==null&&a.lon!==null&&a.observedAt!==null&&now-a.observedAt<120000&&a.observedAt<=now+5000).map(a=>({aircraft:a,distance:trackDistance(center,a as {lat:number;lon:number})})).filter(a=>a.distance<=500).sort((a,b)=>a.distance-b.distance);
 const chosen:typeof recent=[];for(const item of recent){if(chosen.every(x=>trackDistance(x.aircraft as {lat:number;lon:number},item.aircraft as {lat:number;lon:number})>25))chosen.push(item);if(chosen.length===3)break;}return chosen;
}
