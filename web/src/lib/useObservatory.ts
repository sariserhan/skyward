import {providerRetryAt} from './trafficRetry';
import {nextObservationLookup} from './observationPolling';
import {useAccountWatches} from './useAccountWatches';
import {qualityRows} from './positionQuality';
import {retainMotion} from './motionHistory';
import { recordActivity, type ActivityBin } from './exploration';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Aircraft, AirportId, FeedResponse, TrailPoint } from '../types';
import { appendTrail } from './aircraft';
export type WatchItem = Pick<Aircraft, 'hex' | 'callsign' | 'registration' | 'aircraftType'>;
async function fetchFeed(url: string, signal: AbortSignal) {
  if(!navigator.onLine)throw new Error('Offline · waiting for connection.');
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) });
  const data = await response.json().catch(()=>{if(!response.ok)return {};throw new Error('Invalid traffic response.');});
  if (!response.ok) throw Object.assign(new Error(data.error ?? 'Unable to connect to the position feed.'),{retryAt:providerRetryAt(response.headers.get('Retry-After')??data.retryAfter,Date.now(),response.status)});
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
  const {watches,toggleWatch,watchSyncError}=useAccountWatches();
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
    rows=qualityRows(rows.filter(a=>!a.simulation&&!a.hex.startsWith('skyward-')),accepted.current);
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
    let alive = true, inFlight = false, nextAttempt = 0, cooldown = 0, failures = 0;
    const controller = new AbortController();
    setAircraft([]); setError(''); setUpdatedAt(null); setLoading(true);
    async function refresh(force=false) {
      if (inFlight || document.hidden || Date.now()<cooldown || !force&&Date.now()<nextAttempt) return;
      inFlight = true;nextAttempt=Date.now()+25000;
      try {
        const data = await fetchFeed(`/api/aircraft?airport=${airport}`, controller.signal);
        if (!alive) return;
        failures=0;data.aircraft=ingest(data.aircraft);
        setActivity(old=>{const next={...old,[airport]:recordActivity(old[airport]??[],data.aircraft,airport,data.sourceAt)};const keys=Object.keys(next);if(keys.length>8)delete next[keys.find(k=>k!==airport)!];return next;});
        setAircraft(data.aircraft); setUpdatedAt(data.fetchedAt); setError('');
      } catch (e) { if (alive) {failures++;cooldown=e&&typeof e==='object'&&'retryAt' in e&&typeof e.retryAt==='number'?e.retryAt:0;nextAttempt=Math.max(cooldown,Date.now()+Math.min(180000,25000*2**Math.min(3,failures)));setError(e instanceof Error ? e.message : 'Live feed unavailable.');} }
      finally { inFlight = false; if (alive) setLoading(false); }
    }
    const automatic=()=>{void refresh();};
    refreshRef.current = ()=>{void refresh(true);};automatic();
    const id = window.setInterval(automatic, 25000);
    document.addEventListener('visibilitychange', automatic);window.addEventListener('online',automatic);
    return () => { alive = false; controller.abort(); clearInterval(id); document.removeEventListener('visibilitychange', automatic);window.removeEventListener('online',automatic); };
  }, [airport, ingest]);
  const watchedKey=watches.slice(-5).map(w=>w.hex).join(',');
  useEffect(()=>{
    if(!alertsEnabled||!watchedKey)return;
    const keys=watchedKey.split(',');let cursor=0,busy=false,alive=true;
    const controller=new AbortController();
    const poll=async()=>{if(busy||document.hidden)return;const hex=keys[cursor++%keys.length];if(nextObservationLookup(recent.current.get(hex),Date.now())>Date.now())return;busy=true;try{const data=await fetchFeed(`/api/search?kind=hex&q=${hex}`,controller.signal);if(alive)data.aircraft=ingest(data.aircraft);}catch{/* Existing timestamps age; failures never create new fixes. */}finally{busy=false;}};
    void poll();const timer=setInterval(poll,6000);document.addEventListener('visibilitychange',poll);
    return()=>{alive=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
  },[alertsEnabled,watchedKey,ingest]);
  const selectedHex = selected?.hex;
  useEffect(() => {
    if (!selectedHex || selectedHex.startsWith('skyward-')) return;
    let alive = true, busy = false;let failures=0,nextAttempt=0;
    const controller = new AbortController();
    async function follow() {
      if (busy || document.hidden || Date.now()<nextAttempt) return;
      const observed=nextObservationLookup(selectedRef.current??undefined,Date.now());
      if(observed>Date.now()){nextAttempt=observed;setSelectedError('');return;}
      busy = true;const startedAt=Date.now();
      try {
        const data = await fetchFeed(`/api/search?kind=hex&q=${selectedHex}`, controller.signal);
        if (!alive) return;
        failures=0;nextAttempt=startedAt+10000;
        if (data.aircraft.length) { data.aircraft=ingest(data.aircraft); setSelectedError(''); }
        else setSelectedError('No current observation. Showing the last known position.');
      } catch (e) { const cooldown=e&&typeof e==='object'&&'retryAt' in e&&typeof e.retryAt==='number'?e.retryAt:0;nextAttempt=Math.max(cooldown,Date.now()+Math.min(60000,10000*2**Math.min(3,failures++))); if (alive) setSelectedError('Tracking feed unavailable. Awaiting a fresh position; arrival unconfirmed.'); }
      finally { busy = false; }
    }
    void follow(); const id = window.setInterval(follow, 1000);window.addEventListener('online',follow);document.addEventListener('visibilitychange',follow);
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
  const clearSelected = useCallback(() => { searchController.current?.abort(); setSearching(false); setSearchError(''); selectedRef.current = null; setSelected(null); setSelectedError(''); setTrail([]); }, []);
  return { watchSyncError, ingest, activity, histories:histories.current,motionHistories:motionHistories.current, observations, aircraft, selected, select, clearSelected, error, loading, updatedAt, selectedError, watches, toggleWatch, lookup, searching, searchError, trail, refresh: () => refreshRef.current() };
}
