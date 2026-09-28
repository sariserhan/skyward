/** Optional map assets may briefly fail during a restart or connection interruption.
 * Abort belongs to this layer only; aircraft polling never waits for geography. */
import type {AirportGeometry} from "../types";
async function loadMapAsset<T>(url:string,signal:AbortSignal,validate:(data:unknown)=>data is T):Promise<T>{
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),cache:attempt?'reload':'default'});
   if(!response.ok)throw new Error(`Geography HTTP ${response.status}`);
   const data:unknown=await response.json();if(!validate(data))throw new Error('Invalid map asset');
   return data;
  }catch(error){
   if(signal.aborted||attempt===2)throw error;
   await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},attempt?3000:1000);signal.addEventListener('abort',cancel,{once:true});});
  }
 }
 throw new Error("Map asset unavailable");
}

export function loadGeography(url:string,signal:AbortSignal){
 return loadMapAsset(url,signal,(data:unknown):data is {type:'FeatureCollection';features:unknown[]}=>{
  const d=data as {type?:string;features?:unknown}|null;
  return d?.type==='FeatureCollection'&&Array.isArray(d.features);
 });
}
export function loadAirportGeometry(url:string,id:string,signal:AbortSignal){
 return loadMapAsset(url,signal,(data:unknown):data is AirportGeometry=>{
  const d=data as Partial<AirportGeometry>|null;
  return !!d&&d.id===id&&Number.isFinite(d.lat)&&Number.isFinite(d.lon)&&
   ['runways','surfaces','paths','gates'].every(key=>Array.isArray(d[key as keyof AirportGeometry]));
 });
}
