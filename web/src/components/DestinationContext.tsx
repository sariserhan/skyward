import {useMemo} from 'react';
import type {Aircraft,FlightRoute} from '../types';
import {destinationZone,localAirportTime,roughArrival} from '../lib/destinationContext';
import {sunDirectionFixed,solarElevation} from '../lib/solarLighting';
export function DestinationContext({aircraft,route,now}:{aircraft:Aircraft;route:FlightRoute|null;now:number}){
 const destination=route?.airports.length===2?route.airports[1]:null;const minute=Math.floor(now/60000);
 const daylight=useMemo(()=>{const C=window.Cesium;if(!C||!destination||!Number.isFinite(destination.lat)||!Number.isFinite(destination.lon))return 'Unavailable';const time=C.JulianDate.fromDate(new Date(minute*60000)),elevation=solarElevation(C,C.Cartesian3.fromDegrees(destination.lon,destination.lat),sunDirectionFixed(C,time));return elevation>=0?'Daylight':elevation>=-6?'Twilight':'Night';},[destination?.lat,destination?.lon,minute]);
 if(!route||route.callsign!==aircraft.callsign||route.status!=='PLAUSIBLE'||route.airports.length!==2)return null;
 const airport=route.airports[1],zone=destinationZone(airport),local=localAirportTime(now,zone),arrival=roughArrival(aircraft,route,now);
 return <details className="identity-details destination-context"><summary>Destination context · {airport.iata||airport.icao}</summary><dl className="identity-grid"><div><dt>Local time</dt><dd>{local??'Timezone unavailable'}</dd></div><div><dt>Sun at destination</dt><dd>{daylight} · calculated</dd></div><div><dt>Rough arrival</dt><dd>{arrival?`${arrival.minutes} min · ${localAirportTime(arrival.time,zone)??new Date(arrival.time).toISOString().slice(11,16)+' UTC'}`:'Unavailable for the current observation'}</dd></div></dl><p>Direct distance at current ground speed. Excludes turns, wind changes, descent, holding and taxi; this is not an airline ETA. Hidden for stale positions, nearby airports or movement away from the destination.</p><p><a href="https://github.com/jpatokal/openflights" target="_blank" rel="noreferrer">Timezone reference: OpenFlights</a> · ODbL. Local offsets use your browser’s timezone database.</p></details>;
}
