import {useEffect,useMemo,useState} from 'react';
import type {Aircraft,AirportGeometry} from '../types';
import {AIRPORTS} from './airportCatalog';
import {trackDistance} from './positionQuality';
import {loadAirportGeometry} from './geographyLoader';
import {createSyntheticFleet,syntheticAircraft,syntheticCount,syntheticDestination,nearbyObserved,pinSyntheticFlight,regionalSyntheticAircraft} from './syntheticTraffic';
import elevations from '../../data/airport-elevations.json';
import type {CameraArea} from './cameraTraffic';
export function useSyntheticTraffic(area:CameraArea|null,observed:Aircraft[],now:number,selected:Aircraft|null,enabled:boolean){
 useEffect(()=>{pinSyntheticFlight(selected?.hex??null);return()=>pinSyntheticFlight(null);},[selected?.hex]);
 const [population,setPopulation]=useState<Aircraft[]>([]),[error,setError]=useState('');
 const id=useMemo(()=>{if(!area||area.radius>100)return null;let id:string|null=null,near=60;for(const [key,p] of Object.entries(AIRPORTS)){const d=trackDistance(area,p);if(d<near){id=key;near=d;}}return id;},[area?.lat,area?.lon,area?.radius]);
 const count=area?nearbyObserved(observed,area,area.radius,now):0,needed=enabled&&id?syntheticCount(count):0;
 useEffect(()=>{setPopulation([]);setError('');if(!id||!needed)return;const c=new AbortController();const load=async(key:string)=>{const p=await loadAirportGeometry(`${import.meta.env.BASE_URL}data/airports/${key}.json`,key,c.signal);return {...p,elevationFt:(elevations as Record<string,number>)[key]??0};};
 void (async()=>{try{const home=await load(id);const ids=[...new Set(Array.from({length:20},(_,i)=>syntheticDestination(id,i)))];const ports=new Map<string,AirportGeometry>();await Promise.all(ids.map(async k=>{try{ports.set(k,await load(k));}catch{}}));if(!c.signal.aborted){const rows=createSyntheticFleet(home,ports,Date.now());setPopulation(rows);if(!rows.length)setError('Skyward traffic needs a suitable mapped runway at this airport.');}}catch{if(!c.signal.aborted)setError('Skyward airport geometry is temporarily unavailable.');}})();return()=>c.abort();
 },[id,needed>0]);
 const rows=useMemo(()=>needed?population.slice(0,needed).map(a=>area?regionalSyntheticAircraft(a,area,area.radius,now):syntheticAircraft(a,now)):[],[population,needed,now,area]);
 return {rows,observedCount:count,airport:id,error,loading:needed>0&&!population.length&&!error,selected:selected?.simulation?syntheticAircraft(selected,now):null};
}
