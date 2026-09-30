import type {Aircraft,TrailPoint} from '../types.ts';
import {discoverFlights} from './discovery.ts';
import {movement} from './exploration.ts';
export function interestingFlight(rows:Aircraft[],histories:Map<string,TrailPoint[]>,airport:string,center:{lat:number;lon:number},now:number,previous=''){
 return discoverFlights(rows,now,center).filter(({a,distance})=>!a.ground&&!a.positionWarning&&a.altitude!==null&&distance<=150).map(row=>{const trend=movement(row.a,histories.get(row.a.hex)??[],airport,now);return {...row,reason:trend?.direction==='Approaching'?'Approach candidate':trend?.direction==='Moving away'?'Departure candidate':'Nearby airborne flight',view:trend?.direction==='Moving away'?'bird':'side',score:(trend?100:0)-row.distance-(row.a.hex===previous?200:0)};}).sort((a,b)=>b.score-a.score)[0]??null;
}
export function savedFlight(value:unknown){if(!value||typeof value!=='object')return null;const v=value as Record<string,unknown>;return typeof v.hex==='string'&&/^[a-f\d]{6}$/i.test(v.hex)&&typeof v.label==='string'?{hex:v.hex.toLowerCase(),label:v.label.slice(0,80)}:null;}
export type FlightScene={hex:string;view:string};
export type FlightRequest=FlightScene&{serial:number;window?:{side:'left'|'right';position:'front'|'wing'|'rear'}};
export const sceneViews=['side','chase','front','cockpit','cabin','bird','wing','tail','director','orbit','area','free','route'] as const;
