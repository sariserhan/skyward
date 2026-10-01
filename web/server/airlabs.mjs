import airportCatalog from '../data/airport-catalog.json' with {type:'json'};
const airportByCode=new Map(Object.entries(airportCatalog).flatMap(([id,a])=>[[id,a],[a.icao,a]]));
// AirLabs v9 flight details. Never used by the position-refresh loop.
const text = v => typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null;
const stamp = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 4102444800 ? v * 1000 : null;
export function flightCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}[A-Z0-9]{1,7}$/.test(code)) throw new Error('Use an ICAO flight number, for example AAL6.');
  return code;
}
export function normalizeFlight(body, expected, now = Date.now()) {
  if (body?.error) throw new Error('AirLabs could not supply flight details. Check account access and quota.');
  const r = body?.response;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {status: 'NOT_FOUND', flight: null};
  if (text(r.flight_icao)?.toUpperCase() !== flightCode(expected.callsign)) return {status: 'IDENTITY_MISMATCH', flight: null};
  for(const [key,prefix] of [['from','dep'],['to','arr']])if(expected[key]&&![r[`${prefix}_iata`],r[`${prefix}_icao`]].includes(expected[key]))return {status:'ROUTE_MISMATCH',flight:null};
  // A recurring callsign alone cannot establish the currently watched flight instance.
  const hex = text(r.hex)?.toLowerCase();
  const observed = stamp(r.updated);
  const match = /^[a-f0-9]{6}$/i.test(expected.hex ?? '') && hex === expected.hex.toLowerCase();
  const departure = stamp(r.dep_time_ts);
  if(expected.date && (!departure || new Date(departure).toISOString().slice(0,10)!==expected.date))return {status:'DATE_MISMATCH',flight:null};
  const current = observed !== null && now - observed >= -60000 && now - observed <= 300000;
  if (expected.hex && (!match || (!expected.date && !current))) return {status: match ? 'STALE_OR_UNCONFIRMED' : 'IDENTITY_MISMATCH', flight: null};
  const endpoint = prefix => ({
    airport: text(r[`${prefix}_iata`]) ?? text(r[`${prefix}_icao`]),
    name: airportByCode.get(text(r[`${prefix}_iata`])??text(r[`${prefix}_icao`]))?.name??null,
    city: airportByCode.get(text(r[`${prefix}_iata`])??text(r[`${prefix}_icao`]))?.city??null,
    terminal: text(r[`${prefix}_terminal`]), gate: text(r[`${prefix}_gate`]),
    scheduledAt: stamp(r[`${prefix}_time_ts`]), estimatedAt: stamp(r[`${prefix}_estimated_ts`]), actualAt: stamp(r[`${prefix}_actual_ts`]),
  });
  return {status: expected.date ? 'MATCHED_DATED_FLIGHT' : expected.hex ? 'MATCHED_RECENT_AIRCRAFT' : 'UNVERIFIED_FLIGHT_INSTANCE', flight: {
    callsign: text(r.flight_icao), number: text(r.flight_iata), hex,
    status: text(r.status), departure: endpoint('dep'), arrival: endpoint('arr'),
    baggage: text(r.arr_baggage), aircraftType: text(r.aircraft_icao),
    positionObservedAt: observed,
  }};
}
export async function fetchAirLabsFlight({apiKey, callsign, hex, date, from, to, fetchImpl = fetch, now = Date.now()}) {
  const code = flightCode(callsign);
  if (hex !== undefined && !/^[a-f0-9]{6}$/i.test(hex)) throw new Error('Invalid aircraft identity.');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('AIRLABS_API_KEY is not configured.');
  const url = new URL('https://airlabs.co/api/v9/flight');
  url.searchParams.set('flight_icao', code);
  url.searchParams.set('api_key', apiKey);
  let body;
  try {
    // Exactly one request, no redirects, retries or pagination. Never log this URL.
    const res = await fetchImpl(url, {signal: AbortSignal.timeout(8000), redirect: 'error', headers: {Accept: 'application/json'}});
    if (!res.ok) throw new Error('upstream');
    body = await res.json();
  } catch { throw new Error('AirLabs request failed. No automatic retry was made.'); }
  return {provider: 'AirLabs', mode: 'live', fetchedAt: now, ...normalizeFlight(body, {callsign: code, hex, date, from, to}, now), passengers: {status: 'UNAVAILABLE', names: null, onboardCount: null}};
}
export function airlabsPreview(mode) {
  if (mode !== 'demo') return {mode: 'disabled', flight: null, message: 'AirLabs is not connected. No paid lookup was made.'};
  // Deliberately fixed identity/date: never manufacture data for the selected aircraft.
  const result = normalizeFlight({response: {flight_icao: 'DEMO101', flight_iata: 'DEMO101', status: 'scheduled', dep_iata: 'JFK', arr_iata: 'LHR', dep_gate: '12', arr_gate: 'B32', arr_terminal: '5', dep_time_ts: 1790503200, arr_time_ts: 1790528400, arr_estimated_ts: 1790529000}}, {callsign: 'DEMO101'});
  return {provider: 'AirLabs integration preview', mode: 'demo', ...result, passengers: {status: 'UNAVAILABLE', names: null, onboardCount: null}, message: 'Synthetic example DEMO101. Not data for your selected aircraft. No AirLabs request was made.'};
}

export function scheduleAirportCode(airport){
 const a=airportCatalog[airport];
 if(a){if(/^[A-Z]{3}$/.test(a.iata||''))return {code:a.iata,kind:'iata'};if(/^[A-Z0-9]{4}$/.test(a.icao||''))return {code:a.icao,kind:'icao'};return null;}
 return /^[A-Z]{3,4}$/.test(airport||'')?{code:airport,kind:airport.length===3?'iata':'icao'}:null;
}
export async function fetchAirLabsSchedules({apiKey,airport,direction='departures',fetchImpl=fetch,now=Date.now()}){
 const lookup=scheduleAirportCode(airport);if(!lookup||!['departures','arrivals'].includes(direction)||!apiKey)throw Error('Invalid schedule request.');
 const url=new URL('https://airlabs.co/api/v9/schedules');url.searchParams.set(`${direction==='departures'?'dep':'arr'}_${lookup.kind}`,lookup.code);url.searchParams.set('limit','50');url.searchParams.set('api_key',apiKey);
 let body;try{const r=await fetchImpl(url,{signal:AbortSignal.timeout(8000),redirect:'error'});if(!r.ok)throw Error();body=await r.json();if(body.error||!Array.isArray(body.response))throw Error();}catch{throw Error('Schedule lookup unavailable. No automatic retry was made.');}
 const flights=body.response.slice(0,50).flatMap(r=>{const code=text(r.flight_icao);if(!code||!/^[A-Z]{3}[A-Z0-9]{1,7}$/.test(code))return [];const side=direction==='departures'?'dep':'arr';if(r[`${side}_${lookup.kind}`]!==lookup.code)return [];return [normalizeFlight({response:r},{callsign:code},now).flight].filter(Boolean);});
 return {mode:'live',fetchedAt:now,airport,direction,flights,partial:true,message:'Up to 50 received schedules. Coverage varies; this is not a complete airport timetable.'};
}
