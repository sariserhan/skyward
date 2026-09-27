const finite = value => typeof value === 'number' && Number.isFinite(value);
export function routePath(callsign, lat, lon) {
  const code = String(callsign ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(code) || !finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('A valid callsign and observed coordinates are required.');
  return `/api/0/route/${code}/${lat.toFixed(2)}/${lon.toFixed(2)}`;
}
export function normalizeRoute(raw, callsign, fetchedAt) {
  const base = { callsign, source: 'ADSB.lol / Virtual Radar Server standing data', sourceUrl: 'https://github.com/adsblol/api', fetchedAt, airports: [], status: 'NOT_FOUND' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid route response');
  if (raw.callsign !== callsign) throw new Error('Route callsign does not match the selected aircraft');
  if (raw.airport_codes === 'unknown' || !Array.isArray(raw._airports) || raw._airports.length < 2) return base;
  const airports = raw._airports.map(a => ({ icao: a?.icao, iata: typeof a?.iata === 'string' ? a.iata : '', name: a?.name, city: typeof a?.location === 'string' ? a.location : '', lat: a?.lat, lon: a?.lon }));
  if (airports.length > 12 || airports.some(a => !/^[A-Z0-9]{4}$/.test(a.icao ?? '') || typeof a.name !== 'string' || !finite(a.lat) || !finite(a.lon) || Math.abs(a.lat) > 90 || Math.abs(a.lon) > 180)) throw new Error('Incomplete route airport metadata');
  return { ...base, airports, status: raw.plausible === true ? 'PLAUSIBLE' : raw.plausible === false ? 'POSITION_MISMATCH' : 'UNVERIFIED' };
}
