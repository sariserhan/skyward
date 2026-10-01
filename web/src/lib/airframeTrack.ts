import type {AirframeObservation} from './airframeObservations';
/** Bounded page-local observations, never predicted positions or a flight itinerary. */
export function appendAirframeTrack(rows:AirframeObservation[],row:AirframeObservation|null){
 if(!row||!Number.isFinite(row.lat)||!Number.isFinite(row.lon)||!Number.isFinite(row.observedAt)||row.observedAt<=(rows.at(-1)?.observedAt??0))return rows;
 return [...rows,row].slice(-60);
}
