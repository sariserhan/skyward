import {useCallback,useEffect,useRef,useState} from 'react';
import type {Aircraft,FeedResponse} from '../types';
import {areaKey,inCameraArea,combineRegions,trafficRegions,type CameraArea,type TrafficRegion} from './cameraTraffic';
export function useCameraTraffic(area:CameraArea|null,ingest:(rows:Aircraft[])=>Aircraft[]){
 const [state,setState]=useState({key:'',aircraft:[] as Aircraft[],loading:false,error:'',updatedAt:null as number|null,completed:0,total:0,failed:0});
 const [revision,setRevision]=useState(0),previous=useRef<Aircraft[]>([]);const key=areaKey(area);
 const areaRef=useRef(area);areaRef.current=area;
 useEffect(()=>{
  const a=areaRef.current;if(!a||!key)return;let alive=true,busy=false;const controller=new AbortController(),regions=trafficRegions(a);
  setState({key,aircraft:previous.current.filter(row=>inCameraArea(row,a)),loading:true,error:'',updatedAt:null,completed:0,total:regions.length,failed:0});
  const poll=async()=>{
   if(busy||document.hidden)return;if(!navigator.onLine){setState(s=>({...s,loading:false,error:'Offline · waiting for connection. Retained fixes keep their timestamps.'}));return;}busy=true;
   const results:{region:TrafficRegion;rows:Aircraft[]|null}[]=[],errors:string[]=[];let fetchedAt:number|null=null;
   setState(s=>({...s,loading:true,completed:0,failed:0}));
   try{for(const region of regions){
    if(!alive||document.hidden)break;
    try{
     const q=new URLSearchParams({lat:String(region.lat),lon:String(region.lon),radius:String(region.radius)});
     const r=await fetch(`/api/area?${q}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
     if(r.status===404)throw new Error('Restart the Skyward server to enable camera-area traffic.');
     const data=await r.json() as FeedResponse&{error?:string};if(!r.ok)throw new Error(data.error||'Camera traffic unavailable.');
     if(!Array.isArray(data.aircraft)||!Number.isFinite(data.fetchedAt))throw new Error('Invalid traffic response.');
     results.push({region,rows:data.aircraft});fetchedAt=fetchedAt===null?data.fetchedAt:Math.min(fetchedAt,data.fetchedAt);
    }catch(e){if(!alive)break;results.push({region,rows:null});errors.push(e instanceof Error?e.message:'Camera traffic unavailable.');}
    if(alive){
     // Pending regions keep their previous fixes until their own response arrives.
     const pending=regions.slice(results.length).map(region=>({region,rows:null}));
     const rows=ingest(combineRegions([...results,...pending],previous.current,a));
     previous.current=rows;setState({key,aircraft:rows,loading:results.length<regions.length,error:errors.length?`${errors.length}/${regions.length} areas unavailable. ${errors[0]}`:'',updatedAt:fetchedAt,completed:results.length,total:regions.length,failed:errors.length});
    }
   }}finally{busy=false;if(alive)setState(s=>({...s,loading:false}));}
  };
  const start=setTimeout(poll,900),timer=setInterval(poll,35000);document.addEventListener('visibilitychange',poll);window.addEventListener('online',poll);
  return()=>{alive=false;controller.abort();clearTimeout(start);clearInterval(timer);document.removeEventListener('visibilitychange',poll);window.removeEventListener('online',poll);};
 },[key,ingest,revision]);
 const refresh=useCallback(()=>setRevision(n=>n+1),[]);
 return {...state,aircraft:state.key===key?state.aircraft:[],loading:!!key&&(state.key!==key||state.loading),error:state.key===key?state.error:'',updatedAt:state.key===key?state.updatedAt:null,refresh};
}
