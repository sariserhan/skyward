import {useEffect,useState} from 'react';
import type {Aircraft,AirportGeometry,FlightRoute} from '../types';
import {AIRPORTS} from './airportCatalog';
import {trackDistance} from './positionQuality';
import elevations from '../../data/airport-elevations.json';
const cache=new Map<string,AirportGeometry>();
export function useArrivalGeometry(a:Aircraft|null,route:FlightRoute|null){
 const end=route?.status==='PLAUSIBLE'&&route.callsign===a?.callsign&&route.airports.length===2?route.airports[1]:null;
 const id=end&&a?.lat!=null&&a.lon!=null&&trackDistance({lat:a.lat,lon:a.lon},end)<30?Object.entries(AIRPORTS).find(([id,row])=>id===end.iata||row.icao===end.icao)?.[0]:undefined;
 const [state,setState]=useState<{id:string;geometry:AirportGeometry}|null>(null);
 useEffect(()=>{
  if(!id)return;const existing=cache.get(id);if(existing){setState({id,geometry:existing});return;}
  const controller=new AbortController();
  void fetch(`${import.meta.env.BASE_URL}data/airports/${encodeURIComponent(id)}.json`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}).then(r=>{if(!r.ok)throw Error('Arrival geometry unavailable');return r.json();}).then((g:AirportGeometry)=>{if(controller.signal.aborted||g.id!==id||!Array.isArray(g.runways))return;const geometry={...g,elevationFt:(elevations as Record<string,number>)[id]};cache.set(id,geometry);if(cache.size>8)cache.delete(cache.keys().next().value!);setState({id,geometry});}).catch(()=>{/* Remain on bounded observation-based motion if the destination cannot be mapped. */});
  return()=>controller.abort();
 },[id]);
 return state&&state.id===id?state.geometry:null;
}
