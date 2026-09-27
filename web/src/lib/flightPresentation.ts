import {contiguous} from './positionQuality.ts';
import fullLiveries from './fullLiveries.json' with {type:'json'};
import {sourcedModel} from './sourcedModels.ts';
export {sourcedModel} from './sourcedModels.ts';
import type {Aircraft, TrailPoint, Runway} from '../types';
export function fleetProfile(type:string){
 const t=type.trim().toUpperCase();
 const variants:Record<string,string>={B772:'b772',B77L:'b772',B788:'b788',B78X:'b78x',A35K:'a35k',E190:'e190',E195:'e190',E290:'e190',E295:'e190',CRJ7:'crj',CRJ9:'crj',CRJX:'crj',PC12:'pc12'};if(variants[t])return variants[t];
 if(/^A319/.test(t))return 'a319';if(/^BCS/.test(t))return 'a220';
 if(/^B38M|^B39M|^B37M/.test(t))return 'b737max';if(/^B75/.test(t))return 'b757';if(/^B76/.test(t))return 'b767';
 if(/^(AT4|AT7|DH8|DHC6|PC12|BE20|BE30)/.test(t))return 'turboprop';
 if(/^(C15|C17|C18|C20|PA28|PA32|SR2|BE36)/.test(t))return 'light';
 if(/^(C25|C5|C6|C7|GLF|GLEX|GL[567]|FA[0-9]|LJ)/.test(t))return 'bizjet';
 if(/^A38/.test(t))return 'a380';if(/^B74/.test(t))return 'b747';
 if(/^B77/.test(t))return 'b777';if(/^B78/.test(t))return 'b787';
 if(/^A35/.test(t))return 'a350';if(/^A33/.test(t))return 'a330';
 if(/^A321|^A21/.test(t))return 'a321';if(/^A31|^A32|^A20/.test(t))return 'a320';
 if(/^B73|^B38|^B39/.test(t))return 'b737';if(/^E17|^E75|^CRJ|^BCS/.test(t))return 'regional';return 'generic';
}
export function fleetPaint(callsign:string){const p=callsign.trim().slice(0,3).toUpperCase();return ['THY','UAL','AAL','DAL','BAW','DLH','AFR','KLM','QTR','UAE','PGT','SWA','JBU','ETH','SAS','RYR','EZY','WZZ','SIA','CPA','ANA','JAL','QFA','ACA'].includes(p)?p:'neutral';}
export function fallbackFleetUri(a:Pick<Aircraft,'aircraftType'|'callsign'>){return `models/fleet/${fleetProfile(a.aircraftType)}-${fleetPaint(a.callsign)}-v4.gltf`;}
export function fullLivery(a:Pick<Aircraft,'aircraftType'|'callsign'>){const id=sourcedModel(a.aircraftType)?.id,operator=fleetPaint(a.callsign);return fullLiveries.find(l=>l.model===id&&l.operator===operator)??null;}
export function fleetUri(a:Pick<Aircraft,'aircraftType'|'callsign'>){const livery=fullLivery(a);if(livery)return livery.uri;const source=sourcedModel(a.aircraftType),paint=fleetPaint(a.callsign);return source?(paint==='neutral'?source.uri:`models/sourced/branded/${source.id}-${paint}-v1.gltf`):fallbackFleetUri(a);}
export function bearing(a:{lon:number;lat:number},b:{lon:number;lat:number}){const rad=Math.PI/180,dl=(b.lon-a.lon)*rad,x=Math.sin(dl)*Math.cos(b.lat*rad),y=Math.cos(a.lat*rad)*Math.sin(b.lat*rad)-Math.sin(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos(dl);return (Math.atan2(x,y)/rad+360)%360;}
export function observedFrame(points:TrailPoint[],time:number){
 if(!points.length)return null;
 const first=points[0];if(time<=first.time)return {...first,interpolated:false};
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(time<b.time){
 if(!contiguous(a,b))return {...a,interpolated:false};
 const f=(time-a.time)/(b.time-a.time),dl=((b.lon-a.lon+540)%360)-180;
 return {...a,lon:((a.lon+dl*f+540)%360)-180,lat:a.lat+(b.lat-a.lat)*f,altitude:a.altitude+(b.altitude-a.altitude)*f,time,interpolated:true,heading:bearing(a,b)};
 }}return {...points[points.length-1],interpolated:false};
}
export function runwayFrame(r:Runway,kind:'takeoff'|'landing',progress:number){
 const t=Math.max(0,Math.min(1,progress));
 const f=kind==='takeoff'?(t<.55?.8*(t/.55)**2:.8+(t-.55)*5):(t<.5?-2+4*t:.85*(1-(1-(t-.5)*2)**2));
 const height=kind==='takeoff'?Math.max(0,(t-.55)*1500):Math.max(0,(.5-t)*1100);
 const dl=((r.b[0]-r.a[0]+540)%360)-180;
 return {lon:((r.a[0]+dl*f+540)%360)-180,lat:r.a[1]+(r.b[1]-r.a[1])*f,altitude:height/.3048,heading:bearing({lon:r.a[0],lat:r.a[1]},{lon:r.b[0],lat:r.b[1]}),pitch:kind==='takeoff'&&t>.55?10:kind==='landing'&&t<.5?-3:0,ground:height===0};
}

export const profileNames:Record<string,string>={b772:'Boeing 777-200',b788:'Boeing 787-8',b78x:'Boeing 787-10',a35k:'Airbus A350-1000',e190:'Embraer E-Jet',crj:'Bombardier CRJ',pc12:'Pilatus PC-12',a319:'Airbus A319',a320:'Airbus A320',a321:'Airbus A321',a220:'Airbus A220',a330:'Airbus A330',a350:'Airbus A350',a380:'Airbus A380',b737:'Boeing 737',b737max:'Boeing 737 MAX',b747:'Boeing 747',b757:'Boeing 757',b767:'Boeing 767',b777:'Boeing 777',b787:'Boeing 787',regional:'Regional jet',bizjet:'Business jet',turboprop:'Turboprop',light:'Light aircraft',generic:'Generic aircraft'};
