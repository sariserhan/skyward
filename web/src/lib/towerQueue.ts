import type {Aircraft,AirportGeometry} from '../types.ts';
import {bearing} from './flightPresentation.ts';
import {trackDistance} from './positionQuality.ts';
import {onRunway} from './groundOperations.ts';
export type TowerActivity='arrival'|'departure'|'ground';
/** Recent-motion candidates, never a confirmed airport schedule or clearance. */
export function towerQueue(rows:Aircraft[],airport:AirportGeometry,now:number){
 return rows.flatMap(aircraft=>{
  const a=aircraft;if(a.targetKind!=='aircraft'||a.positionWarning||a.lat===null||a.lon===null||a.observedAt===null||now-a.observedAt>60000||now-a.observedAt< -5000)return [];
  const point={lat:a.lat,lon:a.lon},distance=trackDistance(point,airport);if(distance>20)return [];
  let kind:TowerActivity;
  if(a.ground){if(distance>5)return [];kind=(a.groundSpeed??0)>40&&onRunway(point,airport)?'departure':'ground';}
  else {if(a.heading===null||a.verticalRate===null)return [];const towards=Math.abs(((a.heading-bearing(point,airport)+540)%360)-180);if(a.verticalRate< -150&&towards<65)kind='arrival';else if(a.verticalRate>150&&towards>115)kind='departure';else return [];}
  return [{aircraft,kind,distance}];
 }).sort((a,b)=>a.distance-b.distance);
}
