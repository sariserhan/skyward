import {qualityRows} from './positionQuality';
import {retainMotion} from './motionHistory';
import { recordActivity, type ActivityBin } from './exploration';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Aircraft, AirportId, FeedResponse, TrailPoint } from '../types';
import { appendTrail } from './aircraft';
export type WatchItem = Pick<Aircraft, 'hex' | 'callsign' | 'registration' | 'aircraftType'>;
function loadWatches(): WatchItem[] {
  try { const data = JSON.parse(localStorage.getItem('skyward.watches.v1') ?? '[]'); return Array.isArray(data) ? data.filter(a => a && typeof a === 'object' && /^[a-f\d]{6}$/.test(a.hex) && ['callsign','registration','aircraftType'].every(key => typeof a[key] === 'string')).slice(0, 30) : []; } catch { return []; }
}
async function fetchFeed(url: string, signal: AbortSignal) {
  if(!navigator.onLine)throw new Error('Offline · waiting for connection.');
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Unable to connect to the position feed.');
  return data as FeedResponse;
}
export function useObservatory(airport: AirportId, alertsEnabled = false) {
  const [activity,setActivity]=useState<Record<string,ActivityBin[]>>({});
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selected, setSelected] = useState<Aircraft | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [selectedError, setSelectedError] = useState('');
  const [watches, setWatches] = useState<WatchItem[]>(loadWatches);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [observations,setObservations]=useState<Aircraft[]>([]);
  const accepted=useRef(new Map<string,Aircraft>());
  const recent=useRef(new Map<string,Aircraft>());
  const motionHistories=useRef(new Map<string,TrailPoint[]>());
  const histories = useRef(new Map<string, TrailPoint[]>());
  const selectedRef = useRef<Aircraft | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const ingest = useCallback((rows: Aircraft[]) => {
    rows=qualityRows(rows,accepted.current);
    retainMotion(motionHistories.current,rows,selectedRef.current?.hex);
    for (const a of rows) {
      const old=recent.current.get(a.hex);
      if(!old || (a.observedAt??0)>(old.observedAt??0))recent.current.set(a.hex,a);
      if(recent.current.size>300)recent.current.delete(recent.current.keys().next().value!);
      histories.current.set(a.hex, appendTrail(histories.current.get(a.hex) ?? [], a));
      if (histories.current.size > 250) {
        const oldest = [...histories.current.keys()].find(hex => hex !== selectedRef.current?.hex);
        if (oldest) histories.current.delete(oldest);
      }
      if (selectedRef.current?.hex === a.hex) {
        // A provider can omit position on an otherwise valid identity update.
        // Retain the last position and its age, never promote it to a new fix.
        const previous = selectedRef.current;
        const next = a.observedAt !== null && (previous.observedAt === null || a.observedAt >= previous.observedAt) ? a : previous;
        selectedRef.current = next; setSelected(next);
        setTrail(histories.current.get(a.hex) ?? []);
      }
    }
    setObservations([...recent.current.values()]);
    return rows;
  }, []);
  const select = useCallback((a: Aircraft) => { a=qualityRows([a],accepted.current)[0]; if((histories.current.get(a.hex)?.length??0)<(motionHistories.current.get(a.hex)?.length??0)){histories.current.set(a.hex,[...motionHistories.current.get(a.hex)!]);if(histories.current.size>250){const oldest=[...histories.current.keys()].find(hex=>hex!==a.hex);if(oldest)histories.current.delete(oldest);}} selectedRef.current = a; setSelected(a); setSelectedError(''); setTrail(histories.current.get(a.hex) ?? []); }, []);
  useEffect(() => {
    let alive = true, inFlight = false;
    const controller = new AbortController();
    setAircraft([]); setError(''); setUpdatedAt(null); setLoading(true);
    async function refresh() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await fetchFeed(`/api/aircraft?airport=${airport}`, controller.signal);
        if (!alive) return;
        data.aircraft=ingest(data.aircraft);
        setActivity(old=>{const next={...old,[airport]:recordActivity(old[airport]??[],data.aircraft,airport,data.sourceAt)};const keys=Object.keys(next);if(keys.length>8)delete next[keys.find(k=>k!==airport)!];return next;});
        setAircraft(data.aircraft); setUpdatedAt(data.fetchedAt); setError('');
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Live feed unavailable.'); }
      finally { inFlight = false; if (alive) setLoading(false); }
    }
    refreshRef.current = refresh; void refresh();
    const id = window.setInterval(refresh, 25000);
    document.addEventListener('visibilitychange', refresh);window.addEventListener('online',refresh);
    return () => { alive = false; controller.abort(); clearInterval(id); document.removeEventListener('visibilitychange', refresh);window.removeEventListener('online',refresh); };
  }, [airport, ingest]);
  const watchedKey=watches.slice(-5).map(w=>w.hex).join(',');
  useEffect(()=>{
    if(!alertsEnabled||!watchedKey)return;
    const keys=watchedKey.split(',');let cursor=0,busy=false,alive=true;
    const controller=new AbortController();
    const poll=async()=>{if(busy||document.hidden)return;busy=true;try{const data=await fetchFeed(`/api/search?kind=hex&q=${keys[cursor++%keys.length]}`,controller.signal);if(alive)data.aircraft=ingest(data.aircraft);}catch{/* Existing timestamps age; failures never create new fixes. */}finally{busy=false;}};
    void poll();const timer=setInterval(poll,6000);document.addEventListener('visibilitychange',poll);
    return()=>{alive=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
  },[alertsEnabled,watchedKey,ingest]);
  const selectedHex = selected?.hex;
  useEffect(() => {
    if (!selectedHex) return;
    let alive = true, busy = false;let failures=0,nextAttempt=0;
    const controller = new AbortController();
    async function follow() {
      if (busy || document.hidden || Date.now()<nextAttempt) return;
      busy = true;
      try {
        const data = await fetchFeed(`/api/search?kind=hex&q=${selectedHex}`, controller.signal);
        if (!alive) return;
        failures=0;nextAttempt=0;
        if (data.aircraft.length) { data.aircraft=ingest(data.aircraft); setSelectedError(''); }
        else setSelectedError('No current observation. Showing the last known position.');
      } catch { nextAttempt=Date.now()+Math.min(60000,10000*2**Math.min(3,failures++));if (alive) setSelectedError('Tracking feed unavailable. Awaiting a fresh position; arrival unconfirmed.'); }
      finally { busy = false; }
    }
    void follow(); const id = window.setInterval(follow, 10000);window.addEventListener('online',follow);document.addEventListener('visibilitychange',follow);
    return () => { alive = false; controller.abort(); clearInterval(id);window.removeEventListener('online',follow);document.removeEventListener('visibilitychange',follow); };
  }, [selectedHex, ingest]);
  const lookup = useCallback(async (kind: string, q: string) => {
    searchController.current?.abort(); const controller = new AbortController(); searchController.current = controller;
    setSearching(true); setSearchError('');
    try {
      const data = await fetchFeed(`/api/search?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q.trim().toUpperCase())}`, controller.signal);
      if (controller.signal.aborted) return null;
      data.aircraft=ingest(data.aircraft);
      if (!data.aircraft.length) { setSearchError('No aircraft currently reported for that identifier. Try its ATC callsign, such as THY7.'); return null; }
      select(data.aircraft[0]); return data.aircraft[0];
    } catch (e) { if (!controller.signal.aborted) setSearchError(e instanceof Error ? e.message : 'Lookup unavailable.'); return null; }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }, [ingest, select]);
  useEffect(() => () => searchController.current?.abort(), []);
  const toggleWatch = useCallback((a: WatchItem) => {
    setWatches(previous => {
      const next = previous.some(w => w.hex === a.hex) ? previous.filter(w => w.hex !== a.hex) : [...previous, { hex: a.hex, callsign: a.callsign, registration: a.registration, aircraftType: a.aircraftType }].slice(-30);
      try { localStorage.setItem('skyward.watches.v1', JSON.stringify(next)); } catch { /* Private-mode storage can be disabled. */ }
      return next;
    });
  }, []);
  const clearSelected = useCallback(() => { searchController.current?.abort(); setSearching(false); setSearchError(''); selectedRef.current = null; setSelected(null); setSelectedError(''); setTrail([]); }, []);
  return { ingest, activity, histories:histories.current,motionHistories:motionHistories.current, observations, aircraft, selected, select, clearSelected, error, loading, updatedAt, selectedError, watches, toggleWatch, lookup, searching, searchError, trail, refresh: () => refreshRef.current() };
}
