import {useEffect, useRef, useState} from 'react';

type Endpoint = {airport: string|null; terminal: string|null; gate: string|null; scheduledAt: number|null; estimatedAt: number|null};
type Preview = {mode: 'demo'|'disabled'; message: string; flight?: {callsign: string; status: string|null; departure: Endpoint; arrival: Endpoint}|null};
const time = (value: number|null) => value === null ? 'Not supplied' : new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
export function AirLabsDetails() {
  const [result, setResult] = useState<Preview|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController|null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/flight-details', {signal: controller.signal, cache: 'no-store'});
      if (!response.ok) throw new Error('unavailable');
      const data: Preview = await response.json();
      if (!['demo', 'disabled'].includes(data.mode) || typeof data.message !== 'string') throw new Error('invalid');
      if (!controller.signal.aborted) setResult(data);
    } catch { if (request.current === controller) setError('Preview unavailable. You can try again.'); }
    finally { window.clearTimeout(timeout); if (request.current === controller) {request.current = null; setLoading(false);} }
  }
  return <details className="airlabs-details"><summary>Premium flight details · sample preview</summary>
    <p>Preview schedules, gates and arrival estimates using a separate example flight. No paid lookup or automatic refresh.</p>
    <button className="quiet-button" disabled={loading} onClick={load}>{loading ? 'Loading preview…' : result ? 'Reload preview' : 'Load sample details'}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite"><p>{result.mode === 'demo' ? 'Synthetic example DEMO101. Not data for your selected aircraft.' : 'Premium flight details are coming soon. No live lookup was made.'}</p>{result.mode === 'demo' && result.flight && <>
      <strong>{result.flight.callsign} · synthetic example</strong>
      <div className="airlabs-endpoints">{(['departure', 'arrival'] as const).map(side => {const p = result.flight![side]; return <div key={side}>
        <h4>{side === 'departure' ? 'Departure' : 'Arrival'} · {p.airport ?? 'Unknown'}</h4>
        <p>Terminal {p.terminal ?? 'not supplied'} · Gate {p.gate ?? 'not supplied'}</p>
        <p>Scheduled: {time(p.scheduledAt)}<br/>Estimated: {time(p.estimatedAt)}</p>
      </div>;})}</div>
    </>}<p>Passenger names and actual onboard count are unavailable.</p></div>}
  </details>;
}
