import {useEffect,useState} from 'react';
import type {Aircraft,AirportGeometry,FlightRoute} from '../types';
import {AIRPORTS} from './airportCatalog';
import {trackDistance} from './positionQuality';
import elevations from '../../data/airport-elevations.json';
const cache=new Map<string,AirportGeometry>();
export function useArrivalGeometry(a:Aircraft|null,route:FlightRoute|null){
 const identity=a?`${a.hex}/${a.callsign}`:'';
 const [state,setState]=useState<{id:string;identity:string;geometry:AirportGeometry}|null>(null);
 const end=route?.status==='PLAUSIBLE'&&route.callsign===a?.callsign&&route.airports.length===2?route.airports[1]:null;
 let id=end&&a?.lat!=null&&a.lon!=null&&trackDistance({lat:a.lat,lon:a.lon},end)<30?Object.entries(AIRPORTS).find(([id,row])=>id===end.iata||row.icao===end.icao)?.[0]:undefined;
 // Route lookup may be unavailable. Fetch only the closest mapped airport for
 // a low, descending aircraft; predictedLanding still requires runway alignment.
 if(!id&&a&&a.lat!=null&&a.lon!=null&&a.altitude!=null&&(a.verticalRate??0)<-150&&!a.ground&&(!route||(route.status==='NOT_FOUND'&&route.callsign===a.callsign&&route.airports.length===0))){
  const nearby=Object.entries(AIRPORTS).map(([key,airport])=>({key,distance:trackDistance({lat:a.lat!,lon:a.lon!},airport),elevation:(elevations as Record<string,number>)[key]})).filter(p=>p.distance<8&&Number.isFinite(p.elevation)&&a.altitude!-p.elevation>=-200&&a.altitude!-p.elevation<=3000).sort((a,b)=>a.distance-b.distance);
  id=nearby[0]?.key;
 }
 // Keep the already-loaded airport through missing descent fields and touchdown.
 if(!id&&state?.identity===identity&&a?.lat!=null&&a.lon!=null&&(!route||(route.status==='NOT_FOUND'&&route.callsign===a.callsign))&&trackDistance({lat:a.lat,lon:a.lon},state.geometry)<8&&(a.ground||(a.altitude!==null&&a.altitude-state.geometry.elevationFt!<3500)))id=state.id;
 useEffect(()=>{
  if(!id)return;const existing=cache.get(id);if(existing){setState({id,identity,geometry:existing});return;}
  const controller=new AbortController();
  void fetch(`${import.meta.env.BASE_URL}data/airports/${encodeURIComponent(id)}.json`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}).then(r=>{if(!r.ok)throw Error('Arrival geometry unavailable');return r.json();}).then((g:AirportGeometry)=>{if(controller.signal.aborted||g.id!==id||!Array.isArray(g.runways))return;const geometry={...g,elevationFt:(elevations as Record<string,number>)[id]};cache.set(id,geometry);if(cache.size>8)cache.delete(cache.keys().next().value!);setState({id,identity,geometry});}).catch(()=>{/* Remain on observation-based predicted motion if the destination cannot be mapped. */});
  return()=>controller.abort();
 },[id,identity]);
 return state&&state.id===id&&state.identity===identity?state.geometry:null;
}
