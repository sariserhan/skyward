import type { Aircraft, AirportGeometry, TrailPoint } from '../types';
import { AIRPORTS, validAirport } from './airportCatalog.ts';
import { distanceNm } from './experience.ts';
export function nearestAirports(id: string, limit=8) {
 const home=AIRPORTS[id];if(!home)return [];
 return Object.entries(AIRPORTS).filter(([code])=>code!==id).map(([code,a])=>({code,...a,distance:distanceNm(home.lat,home.lon,a.lat,a.lon)})).sort((a,b)=>a.distance-b.distance).slice(0,limit);
}
export type TargetKind='aircraft'|'vehicle'|'fixed'|'unknown';
export const kindLabel=(a:Aircraft)=>({aircraft:'Aircraft',vehicle:'Surface vehicle',fixed:'Fixed object / transmitter',unknown:'Unclassified target'}[a.targetKind??'unknown']);
export function airportPoints(g:AirportGeometry):[number,number][] {
 return [...g.runways.flatMap(r=>[r.a,r.b]),...g.surfaces.filter(s=>s.kind==='terminal').flatMap(s=>s.points),...g.gates.map(x=>x.position)];
}
export interface Movement {hex:string;label:string;direction:'Approaching'|'Moving away';points:TrailPoint[];distance:number;}
export function movement(a:Aircraft,points:TrailPoint[],airport:string,now:number):Movement|null {
 if(a.targetKind==='vehicle'||a.targetKind==='fixed'||a.ground||a.observedAt===null||now-a.observedAt>30000||points.length<3)return null;
 const home=AIRPORTS[airport];if(!home)return null;
 const recent=points.filter(p=>p.time>=now-180000);const end=recent.at(-1);if(!end||end.ground||end.time!==a.observedAt)return null;
 let start=recent.length-1;while(start>0&&recent[start].time-recent[start-1].time<=60000&&!recent[start-1].ground)start--;
 const segment=recent.slice(start);if(segment.length<3||end.time-segment[0].time<20000)return null;
 const distances=segment.map(p=>distanceNm(home.lat,home.lon,p.lat,p.lon));
 const d=distances.at(-1)!;if(d>20||Math.abs(distances[0]-d)<.5)return null;
 const approaching=distances[0]>d;
 // Require a consistent trend, not a single radial jump or a turn past the airport.
 if(distances.slice(1).some((x,i)=>approaching?x>distances[i]+.15:x<distances[i]-.15))return null;
 return {hex:a.hex,label:a.callsign||a.registration||a.hex,direction:approaching?'Approaching':'Moving away',points:segment,distance:d};
}
export interface ActivityBin {minute:number; ids:Record<string,TargetKind>; samples:number;lastSourceAt:number;}
export function recordActivity(previous:ActivityBin[],rows:Aircraft[],airport:string,sourceAt:number):ActivityBin[] {
 if(!Number.isFinite(sourceAt)||sourceAt<=(previous.at(-1)?.lastSourceAt??-Infinity))return previous;
 const home=AIRPORTS[airport];if(!home)return previous;
 const minute=Math.floor(sourceAt/60000)*60000, prior=previous.at(-1);
 const bin:ActivityBin=prior?.minute===minute?{...prior,ids:{...prior.ids},samples:prior.samples+1,lastSourceAt:sourceAt}:{minute,ids:{},samples:1,lastSourceAt:sourceAt};
 for(const a of rows)if(a.lat!==null&&a.lon!==null&&a.observedAt!==null&&sourceAt-a.observedAt<=30000&&sourceAt>=a.observedAt&&distanceNm(home.lat,home.lon,a.lat,a.lon)<=5)bin.ids[a.hex]=a.targetKind??'unknown';
 return [...(prior?.minute===minute?previous.slice(0,-1):previous),bin].slice(-120);
}
export function activityWindow(bins:ActivityBin[],now:number,minutes=30) {
 const end=Math.floor(now/60000)*60000;const byTime=new Map(bins.map(b=>[b.minute,b]));
 return Array.from({length:minutes},(_,i)=>{const minute=end-(minutes-1-i)*60000;return {minute,bin:byTime.get(minute)??null};});
}
export interface AirportCollection {id:string;name:string;airports:string[];}
export function sanitizeCollections(value:unknown):AirportCollection[] {
 if(!Array.isArray(value))return [];
 const ids=new Set<string>();
 return value.filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&/^[a-zA-Z0-9-]{1,60}$/.test(x.id)&&typeof x.name==='string'&&x.name.trim()&&Array.isArray(x.airports)).slice(0,20).flatMap(x=>{if(ids.has(x.id))return [];ids.add(x.id);return [{id:x.id,name:x.name.trim().slice(0,60),airports:[...new Set<string>(x.airports.filter((a:unknown)=>typeof a==='string'&&validAirport(a)))].slice(0,50)}];});
}
