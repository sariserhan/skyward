import {qualityEvent} from './qualityEvents';
import {landingRouteMode} from './landingRoute';
import {loadAirportGeometry} from './geographyLoader';
import {useEffect,useState} from 'react';
import type {Aircraft,AirportGeometry,FlightRoute} from '../types';
import {AIRPORTS} from './airportCatalog';
import {trackDistance} from './positionQuality';
import elevations from '../../data/airport-elevations.json';
const cache=new Map<string,AirportGeometry>();
export function useArrivalGeometry(a:Aircraft|null,route:FlightRoute|null){
 const identity=a?`${a.hex}/${a.callsign}`:'';
 const [state,setState]=useState<{id:string;identity:string;geometry:AirportGeometry}|null>(null);
 const end=route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status)&&route.callsign===a?.callsign&&route.airports.length===2?route.airports[1]:null;
 let id=end&&a?.lat!=null&&a.lon!=null&&trackDistance({lat:a.lat,lon:a.lon},end)<150?Object.entries(AIRPORTS).find(([id,row])=>id===end.iata||row.icao===end.icao)?.[0]:undefined;
 // Missing routes and listed intermediate stops use only the closest eligible airport for
 // a low, descending aircraft; predictedLanding still requires runway alignment.
 if(!id&&a&&a.lat!=null&&a.lon!=null&&a.altitude!=null&&(a.verticalRate??0)<-150&&!a.ground){
  const nearby=Object.entries(AIRPORTS).map(([key,airport])=>({key,distance:trackDistance({lat:a.lat!,lon:a.lon!},airport),elevation:(elevations as Record<string,number>)[key]})).filter(p=>landingRouteMode(a.callsign,route,{id:p.key,...AIRPORTS[p.key]})==='inferred'&&p.distance<8&&Number.isFinite(p.elevation)&&a.altitude!-p.elevation>=-200&&a.altitude!-p.elevation<=3000).sort((a,b)=>a.distance-b.distance);
  id=nearby[0]?.key;
 }
 // Keep the already-loaded airport through missing descent fields and touchdown.
 if(!id&&state?.identity===identity&&a?.lat!=null&&a.lon!=null&&landingRouteMode(a.callsign,route,state.geometry)!==null&&trackDistance({lat:a.lat,lon:a.lon},state.geometry)<8&&(a.ground||(a.altitude!==null&&a.altitude-state.geometry.elevationFt!<3500)))id=state.id;
 useEffect(()=>{
  if(!id)return;const existing=cache.get(id);if(existing){setState({id,identity,geometry:existing});return;}
  const controller=new AbortController();qualityEvent('airport','loading',`Destination ${id}`);
  void loadAirportGeometry(`${import.meta.env.BASE_URL}data/airports/${encodeURIComponent(id)}.json`,id,controller.signal).then((g:AirportGeometry)=>{if(controller.signal.aborted||g.id!==id||!Array.isArray(g.runways))return;const geometry={...g,elevationFt:(elevations as Record<string,number>)[id]};qualityEvent('airport','ready',`Destination ${id}`);cache.set(id,geometry);if(cache.size>8)cache.delete(cache.keys().next().value!);setState({id,identity,geometry});}).catch(()=>{if(!controller.signal.aborted)qualityEvent('airport','failed',`Destination ${id}; observed motion retained`);});
  return()=>controller.abort();
 },[id,identity]);
 return state&&state.id===id&&state.identity===identity?state.geometry:null;
}
