import {targetKind} from './targetKind.ts';
import type {Aircraft,TrailPoint} from '../types';
export function trackDistance(a:{lat:number;lon:number},b:{lat:number;lon:number}){const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 3440.065*2*Math.asin(Math.sqrt(Math.min(1,x)));}
export function positionIssue(previous:Pick<TrailPoint,'time'|'lat'|'lon'|'altitude'>|undefined,next:Pick<TrailPoint,'time'|'lat'|'lon'|'altitude'>,now=Date.now()):string|null{
 if(![next.time,next.lat,next.lon,next.altitude].every(Number.isFinite)||Math.abs(next.lat)>90||Math.abs(next.lon)>180)return 'Invalid position';
 if(next.time>now+5000)return 'Future timestamp';
 if(!previous)return null;
 const dt=next.time-previous.time,d=trackDistance(previous,next);
 if(dt<0)return 'Out-of-order observation';
 if(dt===0)return d>.05||Math.abs(next.altitude-previous.altitude)>100?'Conflicting observation at the same timestamp':null;
 // Reacquisition after a coverage gap is accepted, but never joined by a trail.
 if(dt>120000)return null;
 if(d>1+1200*dt/3600000)return 'Implausible position jump';
 if(Math.abs(next.altitude-previous.altitude)>1000+15000*dt/60000)return 'Implausible altitude change';
 return null;
}
export function qualityRows(rows:Aircraft[],accepted:Map<string,Aircraft>,now=Date.now()):Aircraft[]{return rows.map(a=>{if(!a.targetKind||a.targetKind==='unknown')a={...a,targetKind:targetKind(a.category,a.aircraftType)};if(a.positionWarning)return a;const old=accepted.get(a.hex);if(a.lat===null||a.lon===null||a.observedAt===null||a.altitude===null)return old?{...old,positionWarning:'Incomplete position; retaining last accepted observation'}:a;const point={lat:a.lat,lon:a.lon,time:a.observedAt,altitude:a.altitude};const previous=old&&old.lat!==null&&old.lon!==null&&old.observedAt!==null&&old.altitude!==null?{lat:old.lat,lon:old.lon,time:old.observedAt,altitude:old.altitude}:undefined;const issue=positionIssue(previous,point,now);if(issue)return old?{...old,positionWarning:issue}:{...a,lat:null,lon:null,observedAt:null,positionWarning:issue};const clean={...a,positionWarning:undefined};accepted.delete(a.hex);accepted.set(a.hex,clean);while(accepted.size>4000)accepted.delete(accepted.keys().next().value!);return clean;});}
export function contiguous(a:TrailPoint,b:TrailPoint){return !b.breakBefore&&b.time>a.time&&b.time-a.time<=120000&&!positionIssue(a,b,Infinity);}
export function altitudeColor(altitude:number){return altitude<10000?'#83d9f4':altitude<25000?'#8fdfc8':'#d1a7ff';}
export function coloredTrail(points:TrailPoint[]){const out:{points:TrailPoint[];color:string}[]=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(!contiguous(a,b))continue;const color=altitudeColor((a.altitude+b.altitude)/2),last=out.at(-1);if(last&&last.color===color&&last.points.at(-1)===a)last.points.push(b);else out.push({points:[a,b],color});}return out;}
export function trackSummary(points:TrailPoint[]){let distance=0,observedMs=0,gaps=0,climb=0,descent=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(!contiguous(a,b)){gaps++;continue;}distance+=trackDistance(a,b);observedMs+=b.time-a.time;const d=b.altitude-a.altitude;if(d>0)climb+=d;else descent-=d;}return {distance,observedMs,gaps,climb,descent,spanMs:points.length?points.at(-1)!.time-points[0].time:0};}
