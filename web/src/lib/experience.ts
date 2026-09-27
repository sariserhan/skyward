import { AIRPORTS, validAirport } from './airportCatalog.ts';
import type { Aircraft, AirportId } from '../types';
export type TrafficFilter = 'all' | 'vehicles' | 'fixed' | 'aircraft' | 'unknown' | 'ground' | 'airborne' | 'low' | 'high';
export function matchesTraffic(a: Aircraft, filter: TrafficFilter) {
  if(filter==='vehicles')return a.targetKind==='vehicle';
  if(filter==='fixed'||filter==='aircraft'||filter==='unknown')return (a.targetKind??'unknown')===filter;
  if(['airborne','low','high'].includes(filter)&&(a.targetKind==='fixed'||a.targetKind==='vehicle'))return false;
  if (filter === 'ground') return a.ground;
  if (filter === 'airborne') return !a.ground && a.altitude !== null;
  if (filter === 'low') return !a.ground && a.altitude !== null && a.altitude < 10000;
  if (filter === 'high') return !a.ground && a.altitude !== null && a.altitude >= 10000;
  return true;
}
export function parseView(hash: string) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const airport: AirportId = validAirport(q.get('airport') || '') ? q.get('airport')! : 'IAD';
  const hex = q.get('aircraft') || '';
  const facility = q.get('facility') || '';
  return { airport, mode: q.get('mode') === '2D' ? '2D' as const : '3D' as const,
    aircraft: /^[a-f\d]{6}$/i.test(hex) ? hex.toLowerCase() : '',
    facility: /^facility-[A-Z0-9-]{3,12}-\d{1,6}$/.test(facility) && facility.startsWith(`facility-${airport}-`) ? facility : '',
    hasView: q.has('airport') || /^[a-f\d]{6}$/i.test(hex) };
}
export function distanceNm(lat: number, lon: number, lat2: number, lon2: number) {
  const rad=Math.PI/180,a=Math.sin((lat2-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon)*rad/2)**2;
  return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(a)));
}
export interface LocalEvent { id: string; hex: string; title: string; time: number; }
export interface AlertState { last: Aircraft; gap: boolean; }
const airports=Object.entries(AIRPORTS).map(([id,a])=>({id,lat:a.lat,lon:a.lon}));
export function observeAlerts(previous: AlertState | undefined, a: Aircraft, now: number): {state: AlertState; events: LocalEvent[]} {
  const fresh=a.observedAt!==null && now-a.observedAt<=30000 && a.lat!==null && a.lon!==null;
  if (!previous) return {state:{last:a,gap:false},events:[]};
  const events:LocalEvent[]=[];const label=a.callsign||a.registration||a.hex.toUpperCase();
  const emit=(key:string,title:string)=>events.push({id:`${a.hex}-${key}-${a.observedAt}`,hex:a.hex,title:`${label}: ${title}`,time:now});
  const newer=a.observedAt!==null && a.observedAt>(previous.last.observedAt??0);
  const contiguous=newer&&a.observedAt!-previous.last.observedAt!<=120000;
  if(fresh&&newer){
    if(previous.gap)emit('restored','fresh position received again');
    if(a.targetKind!=='vehicle'&&a.targetKind!=='fixed'&&contiguous&&previous.last.ground&&!a.ground&&a.altitude!==null)emit('airborne','now reported airborne (takeoff unconfirmed)');
    for(const ap of airports){
      if(contiguous&&previous.last.lat!==null&&previous.last.lon!==null&&distanceNm(a.lat!,a.lon!,ap.lat,ap.lon)<=5&&distanceNm(previous.last.lat,previous.last.lon,ap.lat,ap.lon)>5)
        emit(`near-${ap.id}`,`observed within 5 nm of ${ap.id} (arrival unconfirmed)`);
    }
  }
  const last=newer?a:previous.last;
  const gap=last.observedAt!==null&&now-last.observedAt>120000;
  if(gap&&!previous.gap)emit('gap','no fresh position for over 2 minutes; coverage or feed may be interrupted');
  return {state:{last,gap:fresh?false:gap},events};
}
// Original, symbolic meshes are selected by broad airframe family, never a livery/replica claim.
export function modelFamily(type: string) {
  if (/^(B74|A38)/.test(type)) return 'jumbo';
  if (/^(B77|B78|B76|A33|A34|A35)/.test(type)) return 'widebody';
  if (/^(A31|A32|A20|A21|B73|B38|B39|BCS|E19)/.test(type)) return 'narrowbody';
  if (/^(E17|E75|CRJ|E13|E14)/.test(type)) return 'regional';
  return 'generic';
}
