import { useEffect, useRef, useState } from 'react';
import type { Aircraft, FlightRoute } from '../types';
export function useFlightRoute(aircraft: Aircraft | null) {
  const latest = useRef(aircraft); latest.current = aircraft;
  const key = aircraft ? `${aircraft.hex}:${aircraft.callsign}` : '';
  const [state, setState] = useState<{key: string; data: FlightRoute | null; error: string; loading: boolean}>({key: '', data: null, error: '', loading: false});
  const canLookup = aircraft?.targetKind!=='vehicle' && aircraft?.targetKind!=='fixed' && !!aircraft?.callsign && aircraft.lat !== null && aircraft.lon !== null && aircraft.observedAt !== null;
  useEffect(() => {
    if (!canLookup) { setState({key, data: null, loading: false, error: aircraft?.targetKind==='vehicle'||aircraft?.targetKind==='fixed'?'Routes are not applicable to reported surface vehicles or fixed objects.':'Origin and destination require a reported callsign and position.'}); return; }
    const controller = new AbortController(); let busy = false;
    async function load() {
      const a = latest.current;
      if (!a?.callsign || a.lat === null || a.lon === null || a.observedAt === null || busy || document.hidden) return;
      busy = true; setState(previous=>({key,data:previous.key===key?previous.data:null,error:'',loading:true}));
      try {
        const response = await fetch(`/api/route?callsign=${encodeURIComponent(a.callsign)}&lat=${a.lat}&lon=${a.lon}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
        if (!response.ok) throw new Error('Route lookup unavailable. Live aircraft positions are unaffected.');
        const data: FlightRoute = await response.json();
        if (!controller.signal.aborted) setState({key, data, error: '', loading: false});
      } catch (e) { if (!controller.signal.aborted) setState(previous=>({key,data:previous.key===key?previous.data:null,error:e instanceof Error?e.message:'Route unavailable',loading:false})); }
      finally { busy = false; }
    }
    void load(); const timer = setInterval(load, 300000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [key, canLookup]);
  return state.key === key ? state : {key, data: null, loading: !!aircraft?.callsign, error: ''};
}
