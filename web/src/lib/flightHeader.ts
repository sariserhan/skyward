import type {Aircraft,FlightRoute} from '../types.ts';
export function flightHeaderRoute(a:Aircraft|null,route:FlightRoute|null){
 if(!a||!route||route.callsign!==a.callsign||!['PLAUSIBLE','UNVERIFIED'].includes(route.status)||route.airports.length<2)return 'Route unavailable';
 const codes=route.airports.map(p=>p.iata||p.icao||'?');
 return `${codes.join(' → ')}${route.status==='UNVERIFIED'?' · unverified':''}`;
}
