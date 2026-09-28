import zones from '../../data/airport-timezones.json' with {type:'json'};
import {AIRPORTS} from './airportCatalog.ts';
import {distanceNm} from './experience.ts';
import type {Aircraft,FlightRoute,RouteAirport} from '../types';
const byIcao=new Map(Object.entries(AIRPORTS).map(([id,a])=>[a.icao,id]));
export function destinationZone(airport:RouteAirport){
 const id=byIcao.get(airport.icao),entry=id?AIRPORTS[id]:null;
 if(!id||!entry||distanceNm(entry.lat,entry.lon,airport.lat,airport.lon)>11)return null;
 return (zones as Record<string,string>)[id]??null;
}
export function localAirportTime(time:number,zone:string|null){if(!zone)return null;try{return new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(time);}catch{return null;}}
export function roughArrival(a:Aircraft,route:FlightRoute|null,now:number){
 if(!route||route.callsign!==a.callsign||route.status!=='PLAUSIBLE'||route.airports.length!==2||a.ground||a.positionWarning||a.observedAt===null||now-a.observedAt>30000||a.observedAt>now+5000||a.lat===null||a.lon===null||a.groundSpeed===null||a.groundSpeed<100||a.groundSpeed>700||a.heading===null)return null;
 const d=route.airports[1],r=Math.PI/180;
 if(![a.lat,a.lon,a.heading,a.groundSpeed,a.observedAt,now,d.lat,d.lon].every(Number.isFinite)||Math.abs(a.lat)>90||Math.abs(a.lon)>180||Math.abs(d.lat)>90||Math.abs(d.lon)>180)return null;
 const distance=distanceNm(a.lat,a.lon,d.lat,d.lon),dl=(d.lon-a.lon)*r;
 const bearing=Math.atan2(Math.sin(dl)*Math.cos(d.lat*r),Math.cos(a.lat*r)*Math.sin(d.lat*r)-Math.sin(a.lat*r)*Math.cos(d.lat*r)*Math.cos(dl))/r;
 if(!Number.isFinite(distance)||Math.abs(((a.heading-bearing+540)%360)-180)>60||distance<10)return null;
 const minutes=distance/a.groundSpeed*60;if(minutes>1440)return null;
 return {minutes:Math.round(minutes),time:now+minutes*60000,distance};
}
