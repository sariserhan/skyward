import {useEffect,useState} from 'react';
import type {AirframeObservation} from '../lib/airframeObservations';
import {appendAirframeTrack} from '../lib/airframeTrack';
export default function AirframeTrack({row}:{row:AirframeObservation|null}){
 const [rows,setRows]=useState<AirframeObservation[]>(()=>appendAirframeTrack([],row));
 useEffect(()=>{setRows(previous=>appendAirframeTrack(previous,row));},[row]);
 return <section className="airframe-card"><h2>Recent observed track</h2><p>Up to 60 positions checked on this page. Original observation timestamps are preserved. This is a partial track, not a complete flight route; it clears when you leave.</p>{rows.length?<details><summary>{rows.length} observed {rows.length===1?'position':'positions'}</summary><ol>{rows.map(point=><li key={point.observedAt}><time dateTime={new Date(point.observedAt).toISOString()}>{new Date(point.observedAt).toISOString()}</time> · {point.lat?.toFixed(3)}°, {point.lon?.toFixed(3)}° · {point.altitude??'Unknown'} ft</li>)}</ol></details>:<p>Check the latest observation to start this track.</p>}</section>;
}
