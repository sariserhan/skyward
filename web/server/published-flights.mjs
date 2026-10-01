import airports from '../data/airport-catalog.json' with {type:'json'};
import {airlineNames} from '../src/lib/airlineNames.ts';
const MAX_FLIGHTS=5000,codePattern=/^[A-Z]{3}[0-9][A-Z0-9]{0,6}$/;
const airportIds=new Map(Object.entries(airports).map(([id,a])=>[a.icao,id]));
export function validPublishedFlight(r){return !!(r&&codePattern.test(r.code)&&airlineNames[r.code.slice(0,3)]&&Array.isArray(r.airports)&&r.airports.length===2&&r.airports.every(id=>Object.hasOwn(airports,id))&&r.airports[0]!==r.airports[1]&&Number.isFinite(r.observedAt)&&Number.isFinite(r.routeCheckedAt)&&r.observedAt>0&&r.routeCheckedAt>0&&/^[a-f0-9]{6}$/i.test(r.hex)&&typeof r.aircraftType==='string'&&r.aircraftType.length<=12&&typeof r.registration==='string'&&r.registration.length<=24);}
/** Only server-observed aircraft and position-compatible provider routes can publish. */
export function publicationCandidate(route,feed,lat,lon,now=Date.now()){
 if(!route||route.status!=='PLAUSIBLE'||!codePattern.test(route.callsign)||!airlineNames[route.callsign.slice(0,3)]||route.airports?.length!==2||!Number.isFinite(route.fetchedAt)||route.fetchedAt>now+5000||now-route.fetchedAt>3600000)return null;
 const found=new Map();
 for(const item of feed.primary.cache.values())for(const a of item.value?.aircraft??[]){
  if(a.callsign!==route.callsign||a.simulation||a.targetKind!=='aircraft'||!Number.isFinite(a.observedAt)||a.observedAt>now+5000||now-a.observedAt>300000||!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(a.lat-lat)>.25||Math.abs(a.lon-lon)>.25)continue;
  if(!found.has(a.hex)||a.observedAt>found.get(a.hex).observedAt)found.set(a.hex,a);
 }
 if(found.size!==1)return null;
 const a=[...found.values()][0],record={code:route.callsign,airports:route.airports.map(p=>airportIds.get(p.icao)),observedAt:a.observedAt,routeCheckedAt:route.fetchedAt,hex:a.hex,aircraftType:a.aircraftType||'',registration:a.registration||''};
 return validPublishedFlight(record)?record:null;
}
export class PublishedFlights{
 constructor({load=async()=>[],save=async()=>{}}={}){this.save=save;this.tail=Promise.resolve();this.ready=load().then(rows=>{this.rows=new Map(rows.filter(validPublishedFlight).slice(0,MAX_FLIGHTS).map(r=>[r.code,r]));});}
 async records(){await this.ready;return [...this.rows.values()].sort((a,b)=>a.code.localeCompare(b.code));}
 observe(route,feed,lat,lon,now=Date.now()){
  const candidate=publicationCandidate(route,feed,lat,lon,now);if(!candidate)return Promise.resolve(false);
  const task=this.tail.then(async()=>{await this.ready;const old=this.rows.get(candidate.code);
   if(!old&&this.rows.size>=MAX_FLIGHTS)return false;
   if(old&&(candidate.observedAt<=old.observedAt||candidate.routeCheckedAt<old.routeCheckedAt))return false;
   // Bound disk writes while still recording route changes promptly.
   if(old&&candidate.observedAt-old.observedAt<3600000&&JSON.stringify(candidate.airports)===JSON.stringify(old.airports))return false;
   const next=new Map(this.rows);next.set(candidate.code,candidate);await this.save(candidate,[...next.values()]);this.rows=next;return true;
  });this.tail=task.catch(()=>{});return task;
 }
}
export const flightPublicationPath=path=>path==='/sitemap.xml'||path==='/flights'||path.startsWith('/flights/');
