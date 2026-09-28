import {useState} from 'react';
import type {Aircraft,FlightRoute,TrailPoint} from '../types';
import {aircraftFreshness} from '../lib/aircraftFreshness';
import {roughArrival} from '../lib/destinationContext';
import {accountRequest,openAccount} from '../lib/membership';
type Detail={mode:string;message:string;checkedAt:number;flight:{callsign:string;departure:{airport:string|null;gate:string|null;terminal:string|null;scheduledAt:number|null;estimatedAt:number|null};arrival:{airport:string|null;gate:string|null;terminal:string|null;scheduledAt:number|null;estimatedAt:number|null}}|null;usage:{requests:number;limit:number}};
const time=(value:number|null)=>value?new Date(value).toISOString().slice(11,16)+' UTC':'Not supplied';
export function JourneyDetails({aircraft:a,route,trail,now,reducedMotion=false}:{aircraft:Aircraft;route:FlightRoute|null;trail:TrailPoint[];now:number;reducedMotion?:boolean}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[details,setDetails]=useState<Detail|null>(null);
  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
  const destination=route?.status==='PLAUSIBLE'&&route.callsign===a.callsign?route.airports.at(-1):null;
  const eta=roughArrival(a,route,now);
  const key=`${a.callsign.trim().toUpperCase()}:${a.hex.toLowerCase()}:${date}`;
  async function act(check=false){if(busy)return;setBusy(true);setMessage('');try{
    if(check){const result=await accountRequest<Detail>('/api/premium/details',{key});setDetails(result);}
    else {await accountRequest('/api/journeys',{callsign:a.callsign,hex:a.hex,date,alerts:true});setSaved(true);setMessage('Journey saved. Alerts are recorded after verified detail checks.');}
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to complete this request.');}finally{setBusy(false);}}
  return <section className="journey-details" aria-label="Flight at a glance">
    <div className="journey-key-facts"><div><small>Destination</small><strong>{destination?.iata||destination?.icao||'Unconfirmed'}</strong></div><div><small>Rough arrival</small><strong>{eta?time(eta.time):'Unavailable'}</strong></div><div><small>Altitude</small><strong>{a.ground?'On ground':a.altitude===null?'Unknown':`${Math.round(a.altitude).toLocaleString()} ft`}</strong></div><div><small>Speed</small><strong>{a.groundSpeed===null?'Unknown':`${Math.round(a.groundSpeed)} kt`}</strong></div></div>
    <p className="journey-motion">{aircraftFreshness(a,trail,now,reducedMotion).label} · {eta?'Arrival uses distance and current speed; not an airline ETA.':'Arrival estimate needs a recent position and plausible route.'}</p>
    <details><summary>Save journey &amp; premium details</summary>
      <label>Journey departure date · UTC<input type="date" value={date} onChange={e=>{setDate(e.target.value);setSaved(false);setDetails(null);}}/></label>
      <div className="membership-actions"><button disabled={busy||!a.callsign||!date} onClick={()=>void act()}>{saved?'Save again':'Save journey'}</button><button disabled={busy||!saved} onClick={()=>void act(true)}>Check premium details</button><button onClick={openAccount}>Account &amp; journeys</button></div>
      <p>Premium checks require a verified subscription and use your lookup allowance. Test subscriptions return a separate synthetic example.</p>
      {message&&<p role="status">{message}</p>}
      {details&&<div className="premium-check-result"><p>{details.message}</p>{details.flight&&<><strong>{details.flight.callsign} · sample only</strong><p>{details.flight.departure.airport} → {details.flight.arrival.airport}<br/>Arrival estimate: {time(details.flight.arrival.estimatedAt)}<br/>Arrival terminal: {details.flight.arrival.terminal||'Not supplied'} · Gate: {details.flight.arrival.gate||'Not supplied'}</p></>}<small>Checked {new Date(details.checkedAt).toLocaleTimeString()} · {details.usage.requests}/{details.usage.limit} test lookups used.</small></div>}
    </details>
  </section>;
}
