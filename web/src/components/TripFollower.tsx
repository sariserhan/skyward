import {useEffect,useMemo,useRef,useState} from 'react';
import {AIRPORTS,type Aircraft,type FeedResponse,type FlightRoute} from '../types';
import {accountRequest} from '../lib/membership';
import {currentTripAircraft,mergeTrips,observedTrips,savedTripRoutes,tripGroup,tripGroups,validTrip,type TripFlight,type TripQuery} from '../lib/tripFollower';
import {rememberSearchRoute} from '../lib/flightSearch';
import {airlineNames} from '../lib/aircraft';
type Result={mode:string;flights:TripFlight[];message:string;query?:TripQuery;aircraft?:Aircraft[];loading?:boolean};
const today=()=>new Date().toISOString().slice(0,10);
const time=(v:number|null)=>v?new Date(v).toISOString().slice(11,16)+' UTC':'Time unavailable';
export function TripFollower({rows,watch,onOpen}:{rows:Aircraft[];watch:(a:Aircraft)=>void;onOpen:(v:boolean)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState<TripQuery>({from:'IST',to:'IAD',date:today()}),[active,setActive]=useState<TripQuery|null>(null);
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[opening,setOpening]=useState('');
 const [saved,setSaved]=useState<TripQuery[]>(()=>{try{return savedTripRoutes(JSON.parse(localStorage.getItem('skyward.trip-routes.v1')||'[]'));}catch{return [];}});
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),generation=useRef(0),[now,setNow]=useState(Date.now());
 useEffect(()=>{onOpen(open);if(open)dialog.current?.showModal();else dialog.current?.close();return()=>onOpen(false);},[open,onOpen]);
 useEffect(()=>{if(!open)return;const t=setInterval(()=>setNow(Date.now()),10000);return()=>clearInterval(t);},[open]);
 const allRows=useMemo(()=>[...rows,...(result?.aircraft??[])],[rows,result]);
 const flights=useMemo(()=>!active?[]:result?.mode==='demo'?result.flights:mergeTrips(result?.flights??[],observedTrips(active,allRows,now)),[active,result,allRows,now]);
 useEffect(()=>{if(!open||!active||!result?.loading)return;let alive=true;const token=generation.current;const timer=setTimeout(()=>{void accountRequest<Result>('/api/trips?'+new URLSearchParams(active)).then(next=>{if(alive&&generation.current===token)setResult(next);}).catch(()=>{if(alive&&generation.current===token){setError('Discovery update unavailable. Use Find flights to retry.');setResult(r=>r?{...r,loading:false}:r);}});},3000);return()=>{alive=false;clearTimeout(timer);};},[open,active,result]);
 useEffect(()=>{if(!open||!active||result?.mode!=='observed'||result.loading||busy)return;let alive=true;const token=generation.current;const timer=setTimeout(()=>{void accountRequest<Result>('/api/trips?'+new URLSearchParams(active)).then(next=>{if(alive&&token===generation.current)setResult(next);}).catch(()=>{if(alive)setError('Automatic refresh unavailable. Use Find flights to retry.');});},60000);return()=>{alive=false;clearTimeout(timer);};},[open,active,result,busy]);
 const close=()=>{generation.current++;setBusy(false);setOpening('');setOpen(false);trigger.current?.focus();};
 async function search(sample=false,q=query){
  if(!validTrip(q)){setError('Choose two different airport codes and a valid date.');return;}
  const token=++generation.current;setBusy(true);setError('');setNotice('');setOpening('');setResult(null);setActive({...q});
  try{const response=await accountRequest<Result>('/api/trips?'+new URLSearchParams({...q,...(sample?{sample:'1'}:{})}));if(token!==generation.current)return;setResult(response);if(response.query){setActive(response.query);setQuery(response.query);}}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:'Trip lookup unavailable.');}
  finally{if(token===generation.current)setBusy(false);}
 }
 function save(){if(!validTrip(query))return;const next=[{...query},...saved.filter(q=>q.from!==query.from||q.to!==query.to||q.date!==query.date)].slice(0,10);try{localStorage.setItem('skyward.trip-routes.v1',JSON.stringify(next));setSaved(next);setNotice('Route and date saved on this device.');}catch{setError('Unable to save this route on this device.');}}
 async function locate(f:TripFlight){
  const token=++generation.current;setOpening(f.id);setError('');
  try{
   if(f.sample||!f.callsign||f.date!==today()||f.status==='cancelled')throw Error('No verified current aircraft position is available for this flight.');
   const data=await accountRequest<FeedResponse>('/api/search?'+new URLSearchParams({kind:'callsign',q:f.callsign}));
   const a=currentTripAircraft(f,data.aircraft,Date.now());if(!a)throw Error('No recent position found. The flight stays in your trip list.');
   if(f.status==='landed'&&tripGroup({...f,status:'unknown'},a)!=='Landed')throw Error('This aircraft is no longer confirmed on the ground at the destination.');
   const route=await accountRequest<FlightRoute>('/api/route?'+new URLSearchParams({callsign:a.callsign,lat:String(a.lat),lon:String(a.lon)}));
   if(route.status!=='PLAUSIBLE'||route.callsign!==a.callsign||route.airports.length!==2||route.airports[0].iata!==f.from||route.airports[1].iata!==f.to)throw Error('The current aircraft route could not be verified for this trip.');
   if(token!==generation.current)return;rememberSearchRoute(a,route);watch(a);close();
  }catch(e){if(token===generation.current)setError(e instanceof Error?e.message:'Position lookup unavailable.');}
  finally{if(token===generation.current)setOpening('');}
 }
 return <><button ref={trigger} className="quiet-button trip-trigger" onClick={()=>setOpen(true)}>Trip follower</button>{open&&<dialog ref={dialog} className="data-dialog trip-follower" aria-label="Trip follower" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
 <div className="dialog-heading"><div><h2>Follow a trip</h2><p>Find flights between two airports.</p></div><button aria-label="Close trip follower" onClick={close}>×</button></div>
 <form onSubmit={e=>{e.preventDefault();void search();}}><div className="trip-fields"><label>From<input aria-label="Trip origin" list="trip-airports" value={query.from} maxLength={3} onChange={e=>setQuery({...query,from:e.target.value.toUpperCase()})}/></label><button type="button" className="quiet-button trip-swap" aria-label="Swap trip airports" onClick={()=>setQuery({...query,from:query.to,to:query.from})}>⇄</button><label>To<input aria-label="Trip destination" list="trip-airports" value={query.to} maxLength={3} onChange={e=>setQuery({...query,to:e.target.value.toUpperCase()})}/></label><label>Date · UTC<input aria-label="Trip departure date" type="date" value={query.date} onChange={e=>setQuery({...query,date:e.target.value})}/></label></div>
 <datalist id="trip-airports">{Object.entries(AIRPORTS).filter(([code])=>code.length===3).map(([code,a])=><option key={code} value={code}>{a.city} · {a.name}</option>)}</datalist>
 <div className="trip-actions"><button disabled={busy||!!opening} type="submit">{busy?'Searching…':'Find flights'}</button><button type="button" onClick={save} disabled={!validTrip(query)}>Save route</button><button type="button" disabled={busy||!!opening} onClick={()=>void search(true)}>Try sample</button></div></form>
 {!!saved.length&&<details><summary>Saved routes on this device</summary><ul className="trip-saved">{saved.map(q=><li key={q.from+q.to+q.date}><button disabled={busy||!!opening} onClick={()=>{setQuery(q);void search(false,q);}}>{q.from} → {q.to} · {q.date}</button><button aria-label={`Remove saved route ${q.from} to ${q.to}`} onClick={()=>{const next=saved.filter(r=>r!==q);try{localStorage.setItem('skyward.trip-routes.v1',JSON.stringify(next));setSaved(next);}catch{setError('Unable to remove saved route.');}}}>×</button></li>)}</ul></details>}
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 {active&&<section aria-label="Trip results" aria-busy={busy||!!result?.loading}><h3>{active.from} → {active.to} · {active.date}</h3><p className="trip-coverage">{result?.message||'Matching received flights only; schedule lookup pending or unavailable.'}</p><p className="trip-coverage">Received matches use routes verified in this session and today’s observations; their departure date is unconfirmed. Position-based approach and ground phases are inferred. No position is invented.</p>
 {result?.loading&&<p role="status">Discovering aircraft and verifying routes…</p>}{!busy&&!result?.loading&&!flights.length&&<p>No matching flights received for this date. This does not mean the route has no flights.</p>}
 {tripGroups.map(group=>{const items=flights.filter(f=>tripGroup(f,currentTripAircraft(f,allRows,now))===group);return items.length?<section key={group} className="trip-group" aria-label={group}><h4>{group} <span>{items.length}</span></h4><ul>{items.map(f=>{const a=currentTripAircraft(f,allRows,now);return <li key={f.id}><div><strong>{f.number||f.callsign}</strong><span>{airlineNames[f.airline]||f.airline||'Airline unavailable'}{f.sample?' · SAMPLE':''}</span><small>Departure {time(f.departureAt)} · Arrival {time(f.arrivalAt)}</small><small>{a?'Recent position available':'Position unavailable'} · {f.statusBasis==='observed'||f.status==='unknown'?'Observed phase':'Reported status: '+f.status}</small>{f.observedAt&&<small>Last observed {time(f.observedAt)}</small>}</div><button disabled={!!opening||busy||!!f.sample||!f.callsign||f.date!==today()||f.status==='cancelled'} onClick={()=>void locate(f)}>{opening===f.id?'Locating…':a?'Watch flight':'Find aircraft'}</button></li>;})}</ul></section>:null;})}</section>}
 </dialog>}</>;
}
