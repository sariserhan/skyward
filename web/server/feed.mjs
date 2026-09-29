import {targetKind} from './target-kind.mjs';
import { routePath, normalizeRoute } from './routes.mjs';
// No credentials, subscriptions, or paid endpoints. Provider queries are shared,
// serialized and cached across browser sessions; errors never become live data.
import catalog from '../data/airport-catalog.json' with { type: 'json' };
export const AIRPORTS = catalog;
const distanceNm=(a,b,c,d)=>{const r=Math.PI/180;return 6880.13*Math.asin(Math.min(1,Math.sqrt(Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2)));};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export function normalizeAircraft(raw, sourceNow) {
  if (!raw || !/^[a-f\d]{6}$/i.test(raw.hex ?? '')) return null;
  const position = finite(raw.lat) && finite(raw.lon) && Math.abs(raw.lat) <= 90 && Math.abs(raw.lon) <= 180;
  const age = finite(raw.seen_pos) && raw.seen_pos >= 0 ? raw.seen_pos : null;
  const ground = raw.alt_baro === 'ground';
  return {
    category: /^[A-D][0-7]$/.test(raw.category??'') ? raw.category : '', targetKind: targetKind(raw.category,raw.t),
    hex: raw.hex.toLowerCase(), callsign: String(raw.flight ?? '').trim(),
    registration: String(raw.r ?? ''), aircraftType: String(raw.t ?? ''),
    lat: position ? raw.lat : null, lon: position ? raw.lon : null,
    altitude: ground ? 0 : finite(raw.alt_baro) ? raw.alt_baro : null,
    ground, groundSpeed: finite(raw.gs) ? raw.gs : null,
    heading: finite(raw.track) ? raw.track : finite(raw.true_heading) ? raw.true_heading : null,
    verticalRate: finite(raw.baro_rate) ? raw.baro_rate : null,
    observedAt: position && age !== null ? sourceNow - age * 1000 : null,
    sourceType: String(raw.type ?? 'unknown'),
  };
}
export function normalizePayload(raw, fetchedAt = Date.now()) {
  if (!raw || !Array.isArray(raw.ac) || !finite(raw.now)) throw new Error('Invalid provider response');
  const sourceNow = raw.now < 1e12 ? raw.now * 1000 : raw.now;
  if (sourceNow > fetchedAt + 60_000 || sourceNow < fetchedAt - 300_000) throw new Error('Provider timestamp is not current');
  return { source: 'ADSB.lol', fetchedAt, sourceAt: sourceNow, aircraft: raw.ac.map(a => normalizeAircraft(a, sourceNow)).filter(Boolean) };
}
export function searchPath(kind, input) {
  const query = String(input ?? '').trim().toUpperCase();
  if (kind === 'hex' && /^[A-F\d]{6}$/.test(query)) return `/v2/hex/${query}`;
  if (kind === 'callsign' && /^[A-Z\d]{2,10}$/.test(query)) return `/v2/callsign/${query}`;
  if (kind === 'registration' && /^[A-Z\d-]{2,12}$/.test(query)) return `/v2/reg/${query}`;
  throw new Error('Use a valid callsign, aircraft registration, or six-character ICAO hex.');
}

export function cameraAreaPath(lat,lon,radius){
  if(![lat,lon,radius].every(v=>typeof v==='number'&&Number.isFinite(v))||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isInteger(radius)||radius<1||radius>250)throw new Error('Use valid coordinates and a radius of 1–250 nautical miles.');
  // Canonical paths share cache entries across clients without expanding radius.
  return `/v2/point/${Number(lat.toFixed(1))}/${Number(lon.toFixed(1))}/${radius}`;
}

export class FeedClient {
  constructor(fetcher = fetch) { this.fetcher = fetcher; this.cooldowns = new Map(); this.failures = new Map(); this.errors = new Map(); this.cache = new Map(); this.pending = new Map(); this.tail = Promise.resolve(); this.nextAt = 0; this.stats = {started:0,failed:0,cacheHits:0,coalesced:0,suppressed:0,queueExpired:0,lastSuccessAt:null,lastPositionAt:null,totalMs:0}; }
  checkCooldown(origin) {
    const until=this.cooldowns.get(origin)??0;
    if(until>Date.now()){const error=new Error('Flight feed is rate limited. Retrying after the requested pause.');error.retryAfter=Math.ceil((until-Date.now())/1000);throw error;}
  }
  async request(path, body, kind = 'positions', origin = 'https://api.adsb.lol') {
    const key = origin + kind + path + (body ? JSON.stringify(body) : '');
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) {this.stats.cacheHits++;return cached.value;}
    const failure=this.errors.get(key);
    if(failure&&failure.until>Date.now()){this.stats.suppressed++;throw failure.error;}
    this.checkCooldown(origin);
    if (this.pending.has(key)) {this.stats.coalesced++;return this.pending.get(key);}
    if (this.pending.size >= 16) throw new Error('Observation service busy. Please retry shortly.');
    const queuedAt = Date.now();
    const task = this.tail.catch(() => {}).then(async () => {
      this.checkCooldown(origin);
      const wait = Math.max(0, this.nextAt - Date.now());
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      this.checkCooldown(origin);
      if (Date.now() - queuedAt > 15000) {this.stats.queueExpired++;throw new Error('Observation request expired in queue.');}
      this.nextAt = Date.now() + 1100;
      const startedAt=Date.now();this.stats.started++;
      try {
        const response = await this.fetcher(`${origin}${path}`, {
          headers: { 'User-Agent': 'Skyward-Observatory/0.2', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          signal: AbortSignal.timeout(12000), ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          const error = new Error(`Provider returned ${response.status}`); error.status = response.status;
          if(response.status===429){
            const raw=response.headers?.get('retry-after'),seconds=raw?Number(raw):NaN;
            const delay=Number.isFinite(seconds)?seconds*1000:raw?Date.parse(raw)-Date.now():60000;
            const until=Date.now()+Math.max(60000,Number.isFinite(delay)?delay:60000);
            this.cooldowns.set(origin,until);error.retryAfter=Math.ceil((until-Date.now())/1000);
          }
          throw error;
        }
        const raw = await response.json();
        const value = kind === 'route' ? { raw, fetchedAt: Date.now() } : body ? raw : normalizePayload(raw);
        this.failures.delete(origin);this.errors.delete(key);
        this.stats.lastSuccessAt=Date.now();
        if(kind==='positions'&&value.sourceAt)this.stats.lastPositionAt=value.sourceAt;
        this.cache.set(key, { value, expires: Date.now() + (body || kind === 'route' ? 300000 : path.startsWith('/v2/hex/') ? 8000 : 20000) });
        if (this.cache.size > 150) this.cache.delete(this.cache.keys().next().value);
        return value;
      } catch (error) {
        this.stats.failed++;
        // Share brief failures too: concurrent viewers must not hammer a down
        // endpoint. Errors remain errors, never cached empty aircraft arrays.
        this.errors.set(key,{error,until:Date.now()+5000});
        if(this.errors.size>150)this.errors.delete(this.errors.keys().next().value);
        if(!error.status||error.status>=500){const failures=(this.failures.get(origin)??0)+1;this.failures.set(origin,failures);if(failures>=3)this.cooldowns.set(origin,Math.max(this.cooldowns.get(origin)??0,Date.now()+30000));}
        // Back off between upstream requests after failures.
        this.nextAt = Date.now() + 3000;
        throw error;
      } finally {this.stats.totalMs+=Date.now()-startedAt;}
    });
    this.pending.set(key, task);
    this.tail = task;
    try { return await task; } finally { this.pending.delete(key); }
  }
  async route(callsign, lat, lon) {
    const path = routePath(callsign, lat, lon);
    const code = String(callsign).trim().toUpperCase();
    let value;
    if (!(Date.now() < (this.routeServiceRetryAt ?? 0))) {
      try { value = await this.request(path, undefined, 'route'); }
      catch { this.routeServiceRetryAt = Date.now() + 60000; }
    }
    if (!value) {
      // The provider itself redirects callsign-only lookup to this standing-data
      // service. It has no position check: never promote it to a plausible plan.
      try {
        value = await this.request(`/routes/${code.slice(0,2)}/${code}.json`, undefined, 'route', 'https://vrs-standing-data.adsb.lol');
        value = {...value, raw: {...value.raw, plausible: undefined}};
      } catch (error) {
        if (error.status === 404) return normalizeRoute({callsign:code,airport_codes:'unknown'},code,Date.now());
        throw error;
      }
    }
    return normalizeRoute(value.raw, code, value.fetchedAt);
  }
  area(airport) {
    const p = AIRPORTS[airport];
    if (!Object.hasOwn(AIRPORTS,airport)) throw new Error('Unknown airport');
    return this.cameraArea(p.lat,p.lon,100);
  }
  cameraArea(lat,lon,radius) {
    const path=cameraAreaPath(lat,lon,radius);
    const [,queryLat,queryLon]=path.match(/point\/([^/]+)\/([^/]+)/);
    // A recent larger observation circle can answer a contained viewport query.
    // Preserve its original timestamps; never turn cached positions into new fixes.
    for(const [key,cached] of [...this.cache].reverse()){
      const match=key.match(/^https:\/\/api\.adsb\.lolpositions\/v2\/point\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if(!match||cached.expires<=Date.now()||distanceNm(+queryLat,+queryLon,+match[1],+match[2])+radius>+match[3])continue;
      this.stats.cacheHits++;
      return Promise.resolve({...cached.value,aircraft:cached.value.aircraft.filter(a=>a.lat!==null&&a.lon!==null&&distanceNm(+queryLat,+queryLon,a.lat,a.lon)<=radius)});
    }
    for(const [key,pending] of this.pending){
      const match=key.match(/^https:\/\/api\.adsb\.lolpositions\/v2\/point\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if(match&&distanceNm(+queryLat,+queryLon,+match[1],+match[2])+radius<=+match[3]){
        this.stats.cacheHits++;
        return pending.then(value=>({...value,aircraft:value.aircraft.filter(a=>a.lat!==null&&a.lon!==null&&distanceNm(+queryLat,+queryLon,a.lat,a.lon)<=radius)}));
      }
    }
    // Neighboring viewports share a padded half-degree bucket. The 25 nm margin
    // covers the maximum center shift; large 250 nm requests remain unchanged.
    const bucket=radius<=225?cameraAreaPath(Math.round(+queryLat*2)/2,((Math.round(+queryLon*2)/2+540)%360)-180,radius+25):path;
    return this.request(bucket).then(value=>({...value,aircraft:value.aircraft.filter(a=>a.lat!==null&&a.lon!==null&&distanceNm(+queryLat,+queryLon,a.lat,a.lon)<=radius)}));
  }
  search(kind, query) { return this.request(searchPath(kind, query)); }
}
