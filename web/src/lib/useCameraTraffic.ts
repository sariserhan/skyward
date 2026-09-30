import {providerRetryAt,nextTrafficAttempt} from './trafficRetry';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Aircraft,FeedResponse} from '../types';
import {retainedViewportRows,areaKey,inCameraArea,combineRegions,trafficRegions,type CameraArea,type TrafficRegion} from './cameraTraffic';
export function useCameraTraffic(area:CameraArea|null,ingest:(rows:Aircraft[])=>Aircraft[],known:Aircraft[]=[]){
 const [state,setState]=useState({key:'',aircraft:[] as Aircraft[],loading:false,error:'',updatedAt:null as number|null,completed:0,total:0,failed:0});
 const [revision,setRevision]=useState(0),previous=useRef<Aircraft[]>([]);const key=areaKey(area);
 const retryAt=useRef(0),failures=useRef(0),lastSuccess=useRef<number|null>(null),lastArea=useRef('');
 const [nextAttemptAt,setNextAttemptAt]=useState<number|null>(null);
 const areaRef=useRef(area);areaRef.current=area;
 useEffect(()=>{
  const a=areaRef.current;if(!a||!key)return;let alive=true,busy=false,scheduledAt=0;const controller=new AbortController(),regions=trafficRegions(a);
  if(lastArea.current!==key){lastSuccess.current=null;lastArea.current=key;}
  setState({key,aircraft:previous.current.filter(row=>inCameraArea(row,a)),loading:Date.now()>=retryAt.current,error:Date.now()<retryAt.current?'Traffic temporarily rate limited. Retrying automatically.':'',updatedAt:lastSuccess.current,completed:0,total:regions.length,failed:0});
  const poll=async()=>{
   if(busy||document.hidden||Date.now()<Math.max(retryAt.current,scheduledAt))return;if(!navigator.onLine){setState(s=>({...s,loading:false,error:'Offline · waiting for connection. Retained fixes keep their timestamps.'}));return;}busy=true;setNextAttemptAt(null);
   const results:{region:TrafficRegion;rows:Aircraft[]|null}[]=[],errors:string[]=[];let fetchedAt:number|null=null;const stateUpdateTime=lastSuccess.current;
   setState(s=>({...s,loading:true,completed:0,failed:0}));
   try{for(const region of regions){
    if(!alive||document.hidden)break;
    try{
     if(Date.now()<retryAt.current)throw new Error('Flight feed temporarily rate limited. Retrying automatically.');
     const q=new URLSearchParams({lat:String(region.lat),lon:String(region.lon),radius:String(region.radius)});
     const r=await fetch(`/api/area?${q}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
     if(r.status===404)throw new Error('Restart the Skyward server to enable camera-area traffic.');
     if(!r.ok)retryAt.current=Math.max(retryAt.current,providerRetryAt(r.headers.get('Retry-After'),Date.now(),r.status));
     const data=await r.json().catch(()=>{if(!r.ok)return {};throw Error('Invalid traffic response.');}) as FeedResponse&{error?:string;retryAfter?:number};if(!r.ok){retryAt.current=Math.max(retryAt.current,providerRetryAt(r.headers.get('Retry-After')??data.retryAfter,Date.now(),r.status));throw new Error(data.error||'Camera traffic unavailable.');}
     if(!Array.isArray(data.aircraft)||!Number.isFinite(data.fetchedAt))throw new Error('Invalid traffic response.');
     if(!alive)break;
     results.push({region,rows:ingest(data.aircraft)});fetchedAt=fetchedAt===null?data.fetchedAt:Math.min(fetchedAt,data.fetchedAt);lastSuccess.current=fetchedAt;
    }catch(e){if(!alive)break;results.push({region,rows:null});errors.push(e instanceof Error?e.message:'Camera traffic unavailable.');}
    if(alive){
     // Pending regions keep their previous fixes until their own response arrives.
     const pending=regions.slice(results.length).map(region=>({region,rows:null}));
     const rows=combineRegions([...results,...pending],previous.current,a);
     previous.current=rows;setState({key,aircraft:rows,loading:results.length<regions.length,error:errors.length?`${errors.length}/${regions.length} areas unavailable. ${errors[0]}`:'',updatedAt:fetchedAt??stateUpdateTime,completed:results.length,total:regions.length,failed:errors.length});
    }
   }}finally{busy=false;if(alive){
    failures.current=fetchedAt===null?Math.min(4,failures.current+1):0;
    scheduledAt=nextTrafficAttempt(failures.current,Date.now(),retryAt.current);
    setNextAttemptAt(scheduledAt);setState(s=>({...s,loading:false}));
   }}
  };
  const reconnect=()=>{scheduledAt=0;void poll();};
  const start=setTimeout(poll,400),timer=setInterval(poll,1000);document.addEventListener('visibilitychange',poll);window.addEventListener('online',reconnect);
  return()=>{alive=false;controller.abort();clearTimeout(start);clearInterval(timer);document.removeEventListener('visibilitychange',poll);window.removeEventListener('online',reconnect);};
 },[key,ingest,revision]);
 const refresh=useCallback(()=>setRevision(n=>n+1),[]);
 const pending=state.key!==key||state.loading||!!state.error;
 const displayed=pending?retainedViewportRows(state.key===key?state.aircraft:previous.current,known,area,Date.now()):state.aircraft;
 return {...state,nextAttemptAt,aircraft:displayed,loading:!!key&&(state.key!==key||state.loading),error:state.key===key?state.error:'',updatedAt:state.key===key?state.updatedAt:null,refresh};
}
