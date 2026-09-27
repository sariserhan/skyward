import {useId,useState} from 'react';
import type {Aircraft} from '../types';
import {cabinReference,scenarioPassengers,officialCabinGuide} from '../lib/cabin';
import type {CabinReference} from '../lib/cabin';
function Scenario({reference:r}:{reference:CabinReference}) {
  const [occupancy,setOccupancy]=useState(80),[capacity,setCapacity]=useState(Math.round((r.minimum+r.maximum)/2));
  const id=useId();
  return <div className="cabin-scenario">
    <strong>Simulated passengers: {scenarioPassengers(capacity,occupancy)}</strong>
    <p>Illustrative scenario only. This is not a booking or onboard count.</p>
    {r.minimum!==r.maximum?<label htmlFor={`${id}-capacity`}>Scenario seats: {capacity}<input id={`${id}-capacity`} type="range" min={r.minimum} max={r.maximum} value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>:<p>Scenario seats: {capacity}</p>}
    <label htmlFor={`${id}-occupancy`}>Simulated occupancy: {occupancy}%<input id={`${id}-occupancy`} type="range" min="0" max="100" step="1" value={occupancy} onChange={e=>setOccupancy(Number(e.target.value))}/></label>
    <div className="cabin-load" aria-hidden="true"><span style={{width:`${occupancy}%`}}/></div>
  </div>;
}
export function CabinPassengers({aircraft:a}:{aircraft:Aircraft}) {
  const r=cabinReference(a),guide=officialCabinGuide(a);
  return <details className="identity-details cabin-passengers">
    <summary>Cabin &amp; passengers</summary>
    {r?<><dl className="identity-grid"><div><dt>Published seating reference</dt><dd>{r.minimum===r.maximum?r.minimum:`${r.minimum}–${r.maximum}`} seats · {r.label}</dd></div><div><dt>Cabin configuration</dt><dd>{r.configuration}</dd></div></dl>
      <p>{r.operatorReference?'Operator inferred from callsign. ':''}This aircraft’s exact seating and seat map are unverified.</p>
      <p><a href={r.url} target="_blank" rel="noreferrer">{r.publisher} cabin reference</a> · checked {r.checked}</p>
      <Scenario key={`${a.hex}:${a.callsign}:${r.id}`} reference={r}/></>:<p>No sourced passenger-cabin reference for this reported type. Seating and simulation are unavailable.</p>}
    {guide&&<p><a href={guide.url} target="_blank" rel="noreferrer">{guide.label}</a><br/>{guide.description} Operator inferred from callsign.</p>}
    <p className="cabin-actual"><strong>Actual onboard: Not available</strong><br/>No authorized airline passenger feed is connected. Passenger names are not supplied by the flight-tracking feed.</p>
  </details>;
}
