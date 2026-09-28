import {positionIssue,contiguous} from './positionQuality.ts';
import type { Aircraft, TrailPoint, Runway } from '../types';
export const airlineNames: Record<string, string> = { ASA:'Alaska Airlines',CAL:'China Airlines',GIA:'Garuda Indonesia',KAL:'Korean Air',CMP:'Copa Airlines',MSR:'EgyptAir',TRA:'Transavia',ANZ:'Air New Zealand',EIN:'Aer Lingus',IBE:'Iberia',FIN:'Finnair',SWR:'Swiss',IGO:'IndiGo',TAP:'TAP Air Portugal',VLG:'Vueling',NKS:'Spirit Airlines',JST:'Jetstar', RYR:'Ryanair',EZY:'easyJet',WZZ:'Wizz Air',SIA:'Singapore Airlines',CPA:'Cathay Pacific',ANA:'All Nippon Airways',JAL:'Japan Airlines',QFA:'Qantas',ACA:'Air Canada', THY: 'Turkish Airlines', UAL: 'United Airlines', AAL: 'American Airlines', DAL: 'Delta Air Lines', BAW: 'British Airways', DLH: 'Lufthansa', AFR: 'Air France', KLM: 'KLM', QTR: 'Qatar Airways', UAE: 'Emirates', PGT: 'Pegasus Airlines', SHT: 'British Airways', AVA: 'Avianca', AEE: 'Aegean Airlines', SWA: 'Southwest Airlines', JBU: 'JetBlue', ETH: 'Ethiopian Airlines', VJT: 'VistaJet', NAX: 'Norwegian', SAS: 'Scandinavian Airlines' };
export const aircraftNames: Record<string, string> = { B738: 'Boeing 737-800', B39M: 'Boeing 737 MAX 9', B38M: 'Boeing 737 MAX 8', B739: 'Boeing 737-900', B77W: 'Boeing 777-300ER', B772: 'Boeing 777-200', B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo', A333: 'Airbus A330-300', A332: 'Airbus A330-200', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A388: 'Airbus A380', BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300', E75L: 'Embraer 175', E170: 'Embraer 170', CRJ9: 'Bombardier CRJ900' };
export function airline(a: Aircraft) { return airlineNames[a.callsign.slice(0, 3)] ?? 'Operator not identified'; }
export function ageSeconds(a: Aircraft, now: number) { return a.observedAt === null ? Infinity : Math.max(0, (now - a.observedAt) / 1000); }
export function freshness(a: Aircraft, now: number) { const age = ageSeconds(a, now); return age <= 30 ? 'Live observation' : age <= 120 ? 'Last seen' : 'Signal gap'; }
export function duration(seconds: number) { return !Number.isFinite(seconds) ? 'Unknown' : seconds < 60 ? `${Math.floor(seconds)}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`; }
export function hasPosition(a: Aircraft) { return a.lat !== null && a.lon !== null && a.observedAt !== null; }
export function phase(a: Aircraft) { if(a.targetKind==='vehicle')return 'Surface vehicle';if(a.targetKind==='fixed')return 'Fixed object'; if (a.ground) return 'On the ground'; if (a.verticalRate === null) return a.altitude === null ? 'Unknown' : 'Airborne'; if (a.verticalRate > 400) return 'Climbing'; if (a.verticalRate < -400) return 'Descending'; return 'Level flight'; }
export function appendTrail(trail: TrailPoint[], a: Aircraft): TrailPoint[] {
  if (!hasPosition(a) || a.altitude === null || a.positionWarning) return trail;
  if(positionIssue(trail.at(-1),{lat:a.lat!,lon:a.lon!,time:a.observedAt!,altitude:a.altitude},Infinity))return trail;
  if (trail.length && a.observedAt! <= trail[trail.length - 1].time) return trail;
  return [...trail, { lon: a.lon!, lat: a.lat!, altitude: a.altitude, time: a.observedAt!, ground: a.ground, groundSpeed: a.groundSpeed }].slice(-1440);
}
export function splitTrail(points: TrailPoint[]) {
  const segments: TrailPoint[][] = [];
  for (const point of points) {
    const last = segments.at(-1);
    if (!last || !contiguous(last.at(-1)!,point)) segments.push([point]);
    else last.push(point);
  }
  return segments;
}
export function inferRunway(a: Aircraft, runways: Runway[], now: number): string | null {
  // A proximity/alignment estimate, never a confirmed clearance or gate assignment.
  if (a.targetKind==='vehicle'||a.targetKind==='fixed'||!hasPosition(a) || ageSeconds(a, now) > 30 || a.heading === null || a.altitude === null || a.altitude > 1800) return null;
  for (const r of runways) {
    const scale = Math.cos((a.lat! * Math.PI) / 180);
    const x = (a.lon! - r.a[0]) * 111320 * scale, y = (a.lat! - r.a[1]) * 111320;
    const dx = (r.b[0] - r.a[0]) * 111320 * scale, dy = (r.b[1] - r.a[1]) * 111320;
    const t = (x * dx + y * dy) / (dx * dx + dy * dy);
    const perpendicular = Math.abs(x * dy - y * dx) / Math.hypot(dx, dy);
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const diff = Math.abs(((a.heading - bearing + 540) % 360) - 180);
    if (perpendicular < 100 && t > -0.8 && t < 1.8 && (diff < 12 || diff > 168)) {
      const ends = r.id.split('/'); return diff < 12 ? ends[0] : ends[1] ?? ends[0];
    }
  }
  return null;
}
