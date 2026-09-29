import type {AirportGeometry,FlightRoute} from '../types.ts';
import {trackDistance} from './positionQuality.ts';

/** Route hints constrain presentation only; an intermediate stop is not a verified destination. */
export function landingRouteMode(callsign:string,route:FlightRoute|null|undefined,airport:Pick<AirportGeometry,'id'|'lat'|'lon'>):'destination'|'inferred'|null{
 if(!route)return 'inferred';
 if(route.callsign!==callsign)return null;
 if(route.status==='NOT_FOUND'&&route.airports.length===0)return 'inferred';
 const matches=(stop:FlightRoute['airports'][number])=>[stop.iata,stop.icao].includes(airport.id)&&trackDistance(airport,stop)<3;
 if(route.status==='PLAUSIBLE'&&route.airports.length===2)return matches(route.airports[1])?'destination':null;
 // Unverified two-stop hints may identify the destination; multi-stop hints may
 // identify an intermediate stop. Both still require approach geometry checks.
 if(route.status==='UNVERIFIED'&&route.airports.length>=2&&(route.airports.length===2?matches(route.airports[1]):route.airports.some(matches)))return 'inferred';
 return null;
}
