import type {Aircraft} from '../types.ts';
import {AIRPORTS} from './airportCatalog.ts';
import {searchRoute} from './flightSearch.ts';
import {distanceNm} from './experience.ts';
export type TripQuery={from:string;to:string;date:string};
export type TripFlight={id:string;callsign:string;number:string;airline:string;from:string;to:string;date:string;status:string;departureAt:number|null;arrivalAt:number|null;hex:string|null;sample?:boolean;statusBasis?:string;observedAt?:number};
export const tripGroups=['Preparing departure','Airborne','Approaching','Landed','Cancelled','Unknown'] as const;
export function validTrip(q:TripQuery){return Object.hasOwn(AIRPORTS,q.from)&&Object.hasOwn(AIRPORTS,q.to)&&q.from!==q.to&&/^\d{4}-\d{2}-\d{2}$/.test(q.date)&&!Number.isNaN(Date.parse(q.date))&&new Date(q.date).toISOString().slice(0,10)===q.date;}
export function currentTripAircraft(f:TripFlight,rows:Aircraft[],now=Date.now()){
 if(f.sample)return null;
 return rows.find(a=>a.callsign===f.callsign&&(!f.hex||a.hex===f.hex)&&a.observedAt!==null&&now-a.observedAt>=-5000&&now-a.observedAt<=120000&&a.lat!==null&&a.lon!==null)??null;
}
export function tripGroup(f:TripFlight,a:Aircraft|null){
 const status=f.status.toLowerCase();
 if(status==='cancelled')return 'Cancelled';if(status==='landed')return 'Landed';
 const destination=AIRPORTS[f.to],origin=AIRPORTS[f.from];
 if(a&&a.lat!==null&&a.lon!==null){
  const arrival=distanceNm(a.lat,a.lon,destination.lat,destination.lon);
  if(a.ground){if(arrival<5)return 'Landed';if(distanceNm(a.lat,a.lon,origin.lat,origin.lon)<5)return 'Preparing departure';return 'Unknown';}
  if(arrival<50&&(a.verticalRate??0)<-200)return 'Approaching';return 'Airborne';
 }
 if(status==='active')return 'Airborne';if(['scheduled','boarding'].includes(status))return 'Preparing departure';return 'Unknown';
}
export function observedTrips(q:TripQuery,rows:Aircraft[],now=Date.now()):TripFlight[]{
 if(q.date!==new Date(now).toISOString().slice(0,10))return [];
 return rows.flatMap(a=>{const r=searchRoute(a,now);if(!r||r.airports[0].iata!==q.from||r.airports[1].iata!==q.to||!a.observedAt||now-a.observedAt>120000)return [];
 return [{id:`observed:${a.hex}:${a.callsign}`,callsign:a.callsign,number:a.callsign,airline:a.callsign.slice(0,3),...q,status:'unknown',departureAt:null,arrivalAt:null,hex:a.hex}];});
}
export function mergeTrips(schedule:TripFlight[],observed:TripFlight[]){const codes=new Set(schedule.map(f=>f.callsign));return [...schedule,...observed.filter(f=>!codes.has(f.callsign))];}
export function savedTripRoutes(value:unknown):TripQuery[]{return Array.isArray(value)?value.filter((q):q is TripQuery=>!!q&&typeof q==='object'&&typeof q.from==='string'&&typeof q.to==='string'&&typeof q.date==='string'&&validTrip(q)).slice(0,10):[];}
