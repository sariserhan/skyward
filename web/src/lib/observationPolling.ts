import type {Aircraft} from '../types';

// Use the source timestamp, never ingestion time or an extrapolated position.
// A fresh regional fix satisfies the same ten-second observation budget as a lookup.
export function nextObservationLookup(row:Aircraft|undefined, now:number, interval=10000):number {
 if(!row || row.simulation || row.hex.startsWith('skyward-'))return row?Infinity:now;
 const time=row.observedAt;
 if(row.positionWarning || time===null || !Number.isFinite(time) || time>now ||
    row.lat===null || row.lon===null || !Number.isFinite(row.lat) || !Number.isFinite(row.lon))return now;
 return Math.max(now,time+interval);
}
