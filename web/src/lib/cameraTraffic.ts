import type {Aircraft} from '../types';
import {distanceNm} from './experience.ts';
export interface TrafficRegion {lat:number;lon:number;radius:number;}
export interface CameraArea extends TrafficRegion {limited:boolean;regions?:TrafficRegion[];}
const regionKey=(a:TrafficRegion)=>`${a.lat}/${a.lon}/${a.radius}`;
export function trafficRegions(a:CameraArea):TrafficRegion[]{return a.regions??[{lat:a.lat,lon:a.lon,radius:a.radius}];}
export function cameraArea(center:{lat:number;lon:number},points:{lat:number;lon:number}[],wide=false):CameraArea|null{
 if(!Number.isFinite(center.lat)||!Number.isFinite(center.lon)||Math.abs(center.lat)>90)return null;
 const lat=Math.round(center.lat*10)/10,lon=Number((((Math.round(center.lon*10)/10+540)%360)-180).toFixed(1));
 const valid=points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90);
 const extent=Math.max(0,...valid.map(p=>distanceNm(lat,lon,p.lat,p.lon)));
 const radius=Math.min(250,Math.max(25,Math.ceil((extent+8)/25)*25));
 const regions:TrafficRegion[]=[{lat,lon,radius}];
 // Add overlapping regional circles toward uncovered viewport samples. At global
 // scale, retain a bounded regional window rather than pretending to cover Earth.
 if(extent>242){
  for(const p of valid){
   if(regions.length===5)break;
   if(regions.some(r=>distanceNm(r.lat,r.lon,p.lat,p.lon)<r.radius-8))continue;
   const d=distanceNm(lat,lon,p.lat,p.lon);if(d>750)continue;
   // Follow the great-circle bearing, including polar/dateline viewports.
   // Place the circle far enough out to include the sampled edge, with padding.
   const rad=Math.PI/180,phi=lat*rad,target=p.lat*rad,dl=(((p.lon-lon+540)%360)-180)*rad;
   const bearing=Math.atan2(Math.sin(dl)*Math.cos(target),Math.cos(phi)*Math.sin(target)-Math.sin(phi)*Math.cos(target)*Math.cos(dl));
   const angle=Math.min(d,Math.max(300,d-240))/3440.065;
   const nextLat=Math.asin(Math.max(-1,Math.min(1,Math.sin(phi)*Math.cos(angle)+Math.cos(phi)*Math.sin(angle)*Math.cos(bearing))));
   const nextLon=lon*rad+Math.atan2(Math.sin(bearing)*Math.sin(angle)*Math.cos(phi),Math.cos(angle)-Math.sin(phi)*Math.sin(nextLat));
   const r={lat:Math.round(nextLat/rad*10)/10,lon:Number((((Math.round(nextLon/rad*10)/10+540)%360)-180).toFixed(1)),radius:250};
   if(!regions.some(q=>distanceNm(q.lat,q.lon,r.lat,r.lon)<100))regions.push(r);
  }
 }
 return {lat,lon,radius,limited:wide||extent+8>250,regions};
}
export function areaKey(a:CameraArea|null){return a?trafficRegions(a).map(regionKey).join(';'):'';}
export function inRegion(a:Aircraft,area:TrafficRegion){return a.lat!==null&&a.lon!==null&&distanceNm(area.lat,area.lon,a.lat,a.lon)<=area.radius;}
export function inCameraArea(a:Aircraft,area:CameraArea){return trafficRegions(area).some(r=>inRegion(a,r));}
export function mergeCameraAircraft(rows:Aircraft[],previous:Aircraft[],area:CameraArea){
 const old=new Map(previous.map(a=>[a.hex,a])),current=new Map<string,Aircraft>();
 for(const a of rows){const prior=current.get(a.hex)??old.get(a.hex);current.set(a.hex,prior&&(prior.observedAt??0)>(a.observedAt??0)?prior:a);}
 return [...current.values()].filter(a=>inCameraArea(a,area));
}
export function combineRegions(results:{region:TrafficRegion;rows:Aircraft[]|null}[],previous:Aircraft[],area:CameraArea){
 const successful=results.filter(r=>r.rows!==null),failed=results.filter(r=>r.rows===null);
 const retained=previous.filter(a=>failed.some(r=>inRegion(a,r.region))&&!successful.some(r=>inRegion(a,r.region)));
 return mergeCameraAircraft([...successful.flatMap(r=>r.rows!),...retained],previous,area);
}

/** Only recently received real fixes can bridge a new/failed viewport request. */
export function retainedViewportRows(rows:Aircraft[],known:Aircraft[],area:CameraArea|null,now:number){
 if(!area)return [];
 const latest=new Map(rows.map(a=>[a.hex,a]));
 for(const a of known){if(a.observedAt===null||now-a.observedAt>120000||a.observedAt>now+1000||!inCameraArea(a,area))continue;const old=latest.get(a.hex);if(!old||(old.observedAt??0)<a.observedAt)latest.set(a.hex,a);}
 return [...latest.values()].filter(a=>inCameraArea(a,area));
}

/** A watched flight owns its coverage window; camera orbit must not restart polling. */
export function flightTrafficArea(position:{lat:number;lon:number},previous:CameraArea|null):CameraArea|null{
 if(!Number.isFinite(position.lat)||!Number.isFinite(position.lon)||Math.abs(position.lat)>90)return previous;
 if(previous&&distanceNm(previous.lat,previous.lon,position.lat,position.lon)<20)return previous;
 const area=cameraArea(position,[]);return area?{...area,radius:50,regions:[{lat:area.lat,lon:area.lon,radius:50}]}:previous;
}
