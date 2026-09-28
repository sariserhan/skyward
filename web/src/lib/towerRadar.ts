import type {Aircraft} from '../types.ts';
import {trackDistance} from './positionQuality.ts';
import {bearing} from './flightPresentation.ts';
export type RadarPoint={lat:number;lon:number};
/** Airport-centred azimuthal projection: north up, distance in nautical miles. */
export function radarPoint(center:RadarPoint,point:RadarPoint,range:number,orientation=0){
 if(!Number.isFinite(range)||range<=0||![center.lat,center.lon,point.lat,point.lon].every(Number.isFinite)||Math.abs(point.lat)>90||Math.abs(center.lat)>90)return null;
 const distance=trackDistance(center,point),angle=(bearing(center,point)-orientation)*Math.PI/180;
 return {x:150+distance/range*128*Math.sin(angle),y:150-distance/range*128*Math.cos(angle),distance,inside:distance<=range};
}
export function radarReadout(a:Aircraft,ownAltitude?:number|null){
 const altitude=a.ground?'GND':a.altitude!==null&&Number.isFinite(a.altitude)?`${Math.round(a.altitude).toLocaleString('en-US')} ft`:'ALT —';
 const speed=a.groundSpeed!==null&&Number.isFinite(a.groundSpeed)?`${Math.round(a.groundSpeed)} kt`:'GS —';
 const trend=a.verticalRate!==null&&Number.isFinite(a.verticalRate)?a.verticalRate>150?' ↑':a.verticalRate<-150?' ↓':'':'';
 const delta=ownAltitude!==undefined&&ownAltitude!==null&&Number.isFinite(ownAltitude)&&a.altitude!==null&&Number.isFinite(a.altitude)&&!a.ground?Math.round((a.altitude-ownAltitude)/100)*100:null;
 const relative=delta===null?altitude:`${delta>=0?'+':''}${delta.toLocaleString('en-US')} ft`;
 return `${relative}${trend} · ${speed}`;
}

export function radarAltitudeMatch(altitude:number|null,ownAltitude:number|null|undefined,band:number){
 if(!band||ownAltitude===null||ownAltitude===undefined||!Number.isFinite(ownAltitude))return true;
 return altitude!==null&&Number.isFinite(altitude)&&Math.abs(altitude-ownAltitude)<=band;
}
export function radarBearing(center:RadarPoint,point:RadarPoint,heading=0){return (bearing(center,point)-heading+360)%360;}
