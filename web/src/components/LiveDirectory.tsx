import {useEffect,useRef,useState} from 'react';
import {identityAt, type Catalog} from '../lib/airframeCatalog';
import {matchAirframeObservation} from '../lib/airframeObservations';
import {eligibleLiveCandidates,liveCandidates,liveCollections} from '../lib/liveCollections';
import type {Aircraft} from '../types';
const cooldownKey='skyward.live-directory-check.v1';
function nextCheck(){try{const value=Number(sessionStorage.getItem(cooldownKey));return Number.isFinite(value)&&value>Date.now()&&value<=Date.now()+60000?value:0;}catch{return 0;}}
export default function LiveDirectory({c}:{c:Catalog}){
 const [collection,setCollection]=useState(()=>{const requested=new URLSearchParams(location.search).get('collection')??'';return requested==='sports'||c.entities.some(e=>e.id===requested&&liveCandidates(c,Date.now(),e.id).length>0)?requested:'';});
 const [batch,setBatch]=useState(0);
 const candidates=eligibleLiveCandidates(c,Date.now(),collection);
 const [rows,setRows]=useState<Aircraft[]>([]),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[next,setNext]=useState(nextCheck);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),10000);return()=>{clearInterval(timer);controller.current?.abort();};},[]);
 const check=async()=>{
  if(controller.current||Date.now()<Math.max(next,nextCheck()))return;
  const ctrl=new AbortController();controller.current=ctrl;setBusy(true);setMessage('Checking recent airborne observations…');const nextAt=Date.now()+60000;setNext(nextAt);try{sessionStorage.setItem(cooldownKey,String(nextAt));}catch{/* Local state still enforces the cooldown. */}let checked=0;const found:Aircraft[]=[];
  try{
   for(const a of liveCandidates(c,Date.now(),collection,batch*10)){
    if(ctrl.signal.aborted)break;
    const hex=identityAt(a,'icaoIdentities')?.value;
    const response=await fetch('/api/search?'+new URLSearchParams({kind:hex?'hex':'registration',q:hex??identityAt(a,'registrations')!.value}),{signal:AbortSignal.any([ctrl.signal,AbortSignal.timeout(12000)])});
    if(!response.ok)throw Error('Tracking is temporarily unavailable. Checks stopped; try again later.');
    const data=await response.json(),match=matchAirframeObservation(c,a,data.aircraft);checked++;
    if(match?.ground===false)found.push({...match,ground:false,callsign:match.registration,aircraftType:a.model,heading:null,verticalRate:null,sourceType:'observed'});
    setRows([...found]);setNow(Date.now());
   }
   if(!ctrl.signal.aborted)setMessage(`Checked ${checked} aircraft in our curated collections. Coverage is incomplete; no result does not mean an aircraft is grounded.`);
  }catch(e){if(!ctrl.signal.aborted)setMessage(e instanceof Error?e.message:'Unable to check observations.');}
  finally{if(!ctrl.signal.aborted){setBusy(false);controller.current=null;}}
 };
 const active=liveCollections(c,rows,now);
 return <section aria-label="Live aircraft collections">
  <p className="airframe-eyebrow">Team jets. Iconic fleets. A window into the skies.</p>
  <h2>Catch them in flight.</h2>
  <p>Discover airborne aircraft associated with teams, airlines and organizations. Choose an aircraft and watch its journey on the globe.</p>
  <label>Choose a collection<select value={collection} disabled={busy} onChange={e=>{setCollection(e.target.value);setBatch(0);const params=new URLSearchParams(location.search);if(e.target.value)params.set('collection',e.target.value);else params.delete('collection');history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));setRows([]);setMessage('');}}><option value="">All collections · up to 10 aircraft</option><option value="sports">Sports teams · up to 10 aircraft</option>{c.entities.filter(e=>liveCandidates(c,now,e.id).length>0).map(e=><option key={e.id} value={e.id}>{e.displayName}</option>)}</select></label>
  {candidates.length>10&&<label>Aircraft batch<select aria-label="Aircraft batch" disabled={busy} value={batch} onChange={e=>{setBatch(Number(e.target.value));setRows([]);setMessage('');}}>{Array.from({length:Math.ceil(candidates.length/10)},(_,i)=><option key={i} value={i}>Aircraft {i*10+1}–{Math.min(candidates.length,(i+1)*10)} of {candidates.length}</option>)}</select></label>}
  <button onClick={check} disabled={busy||now<next}>{busy?'Checking aircraft…':now<next?'Check available shortly':'Find airborne aircraft'}</button>
  <p><small>Up to 10 checks per request. No automatic background polling.</small></p>
  {message&&<p role="status">{message}</p>}
  {!active.length&&!busy&&<p>{message?'No recent airborne matches to show.':'Check for active aircraft to begin. Only recent airborne observations appear here.'}</p>}
  <div className="airframe-grid">{active.map(({aircraft:a,names,relationship})=><article className="airframe-card" key={a.hex}>
   <p className="airframe-eyebrow">Airborne · recently observed</p><h3>{names}</h3><p>{relationship}</p><p>{a.registration} · {a.aircraftType}</p><p>Destination unknown · open flight view for available route information.</p>
   <a href={`/#aircraft=${encodeURIComponent(a.hex)}&scene=flight&view=side`}>Watch live →</a>
   <p><small>Position observed {new Date(a.observedAt!).toLocaleTimeString()} · Passengers unknown</small></p>
  </article>)}</div>
  <p className="airframe-directory-note">Associations are sourced aircraft relationships, not evidence of who is onboard. “Live” uses recent observations with estimated motion between updates.</p>
 </section>;
}
