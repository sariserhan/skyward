import type {Aircraft} from '../types.ts';
import {airlineNames,aircraftNames} from './aircraft.ts';
export interface SearchFields {text:string;airline:string;type:string;registration:string;}
export const emptySearch:SearchFields={text:'',airline:'',type:'',registration:''};
const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function matchesFlightSearch(a:Aircraft,f:SearchFields){const operator=`${a.callsign.slice(0,3)} ${airlineNames[a.callsign.slice(0,3)]??''}`,type=`${a.aircraftType} ${aircraftNames[a.aircraftType]??''}`;const all=normalize(`${a.hex} ${a.callsign} ${a.registration} ${operator} ${type}`);return normalize(f.text).split(/\s+/).filter(Boolean).every(t=>all.includes(t))&&normalize(operator).includes(normalize(f.airline))&&normalize(type).includes(normalize(f.type))&&normalize(a.registration).includes(normalize(f.registration));}
export function recentSearches(raw:unknown):SearchFields[]{if(!Array.isArray(raw))return [];return raw.filter(x=>x&&['text','airline','type','registration'].every(k=>typeof x[k]==='string'&&x[k].length<=100)).filter(x=>['text','airline','type','registration'].some(k=>x[k].trim())).slice(0,10).map(x=>({text:x.text,airline:x.airline,type:x.type,registration:x.registration}));}
