import type {Aircraft,FlightRoute} from '../types.ts';
import {airlineNames,aircraftNames} from './aircraft.ts';
export interface SearchFields {text:string;airline:string;type:string;registration:string;origin:string;destination:string;}
export const emptySearch:SearchFields={text:'',airline:'',type:'',registration:'',origin:'',destination:''};
const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
// Session-only index: search never initiates an API request per aircraft.
const routes=new Map<string,FlightRoute>();
export function rememberSearchRoute(a:Aircraft,r:FlightRoute){
 const key=`${a.hex}:${a.callsign}`;routes.delete(key);
 if(r.status==='PLAUSIBLE'&&r.callsign===a.callsign&&r.airports.length===2){routes.set(key,r);while(routes.size>200)routes.delete(routes.keys().next().value!);}
}
export function searchRoute(a:Aircraft,now=Date.now()){
 const r=routes.get(`${a.hex}:${a.callsign}`);
 return r&&Number.isFinite(r.fetchedAt)&&now-r.fetchedAt>=-5000&&now-r.fetchedAt<1800000?r:null;
}
export function matchesFlightSearch(a:Aircraft,f:SearchFields,route=searchRoute(a)){
 const operator=`${a.callsign.slice(0,3)} ${airlineNames[a.callsign.slice(0,3)]??''}`,type=`${a.aircraftType} ${aircraftNames[a.aircraftType]??''}`;
 const places=route?.airports.map(p=>`${p.iata} ${p.icao} ${p.name} ${p.city}`)??[];
 const all=normalize(`${a.hex} ${a.callsign} ${a.registration} ${operator} ${type} ${places.join(' ')}`);
 return normalize(f.text).split(/\s+/).filter(Boolean).every(t=>all.includes(t))&&normalize(operator).includes(normalize(f.airline))&&normalize(type).includes(normalize(f.type))&&normalize(a.registration).includes(normalize(f.registration))&&normalize(places[0]??'').includes(normalize(f.origin??''))&&normalize(places[1]??'').includes(normalize(f.destination??''));
}
export function recentSearches(raw:unknown):SearchFields[]{
 if(!Array.isArray(raw))return [];
 return raw.filter(x=>x&&['text','airline','type','registration'].every(k=>typeof x[k]==='string'&&x[k].length<=100)&&['origin','destination'].every(k=>x[k]===undefined||typeof x[k]==='string'&&x[k].length<=100)).map(x=>({...emptySearch,...Object.fromEntries(Object.keys(emptySearch).map(k=>[k,x[k]??'']))})).filter(x=>Object.values(x).some(v=>v.trim())).slice(0,10);
}
