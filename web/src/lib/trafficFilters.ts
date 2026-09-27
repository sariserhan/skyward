import type {Aircraft} from '../types';
import {fleetProfile,profileNames,sourcedModel} from './flightPresentation.ts';
export interface TrafficFilters {airline:string;type:string;minAltitude:string;maxAltitude:string;minSpeed:string;maxSpeed:string;direction:'all'|'Approaching'|'Moving away';}
export const emptyFilters:TrafficFilters={airline:'',type:'',minAltitude:'',maxAltitude:'',minSpeed:'',maxSpeed:'',direction:'all'};
export const filtersActive=(f:TrafficFilters)=>Object.entries(f).some(([k,v])=>k==='direction'?v!=='all':v!=='');
function within(value:number|null,min:string,max:string){return (!min&&!max)||value!==null&&(!min||value>=Number(min))&&(!max||value<=Number(max));}
export function matchesFilters(a:Aircraft,f:TrafficFilters,direction?:string){
 return (!f.airline||a.callsign.toUpperCase().startsWith(f.airline.toUpperCase()))&&(!f.type||`${a.aircraftType} ${sourcedModel(a.aircraftType)?.label??profileNames[fleetProfile(a.aircraftType)]}`.toLowerCase().includes(f.type.trim().toLowerCase()))&&within(a.altitude,f.minAltitude,f.maxAltitude)&&within(a.groundSpeed,f.minSpeed,f.maxSpeed)&&(f.direction==='all'||direction===f.direction);
}
