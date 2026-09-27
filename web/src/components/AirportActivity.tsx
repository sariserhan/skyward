import {useState} from 'react';
import type {Aircraft,AirportGeometry,TrailPoint} from '../types';
import {trafficBoard,type BoardFilter} from '../lib/discovery';
import {inferRunway} from '../lib/aircraft';
export function AirportActivity({airport,aircraft,histories,geometry,now,select}:{airport:string;aircraft:Aircraft[];histories:Map<string,TrailPoint[]>;geometry?:AirportGeometry;now:number;select:(a:Aircraft)=>void}){
 const [filter,setFilter]=useState<BoardFilter>('all');
 const rows=trafficBoard(aircraft,histories,airport,now);
 const shown=rows.filter(r=>filter==='all'||r.category===filter);
 return <details className="identity-details airport-activity"><summary>Arrival, departure &amp; runway activity · {rows.length} nearby</summary>
  <p>Movement trends within 20 nm, ground within 5 nm. Inferred approaches and departures are not confirmed airport assignments.</p>
  <div className="traffic-filter">{([['all','All'],['approaching','Approaching'],['departing','Moving away'],['ground','Ground']] as const).map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label} · {value==='all'?rows.length:rows.filter(r=>r.category===value).length}</button>)}</div>
  <div className="activity-rows">{shown.slice(0,12).map(({a,distance,label})=>{const agl=geometry?.elevationFt===undefined?null:a.altitude===null?null:a.altitude-geometry.elevationFt;const runway=geometry&&agl!==null?inferRunway({...a,altitude:agl},geometry.runways,now):null;return <button key={a.hex} onClick={()=>select(a)}><strong>{a.callsign||a.registration||a.hex}</strong><span>{label} · {distance.toFixed(1)} nm{runway?` · runway ${runway} alignment (inferred)`:''}</span></button>;})}</div>
  {!shown.length&&<p>No matching observations; more recent fixes may be needed.</p>}{shown.length>12&&<p>Nearest 12 shown. Open Traffic board for the full list.</p>}
 </details>;
}
