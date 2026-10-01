import {flightDisplayCode} from '../../shared/flight-identifiers.mjs';
import {JourneyDetails} from './JourneyDetails';
import {CabinPassengers} from './CabinPassengers';
import {SheetHandle} from './SheetHandle';
import {FlightSummary} from './FlightSummary';
import {RouteOverview} from './RouteOverview';
import {MotionDiagnostics} from './MotionDiagnostics';
import {motionStatus} from '../lib/motionHistory';
import {AircraftIdentity} from './AircraftIdentity';
import {kindLabel} from '../lib/exploration';
import { ReplayTimeline } from './ReplayTimeline';
import { Navigation, Star, Crosshair, X, Download, Play, Radio } from 'lucide-react';
import type { Aircraft, TrailPoint, Runway, FlightRoute } from '../types';
import { ageSeconds, airline, aircraftNames, duration, freshness, inferRunway, phase } from '../lib/aircraft';
interface Props { compare:()=>void; quality:string;feedHealth:{error:string;updatedAt:number|null}; reducedMotion:boolean; aircraft: Aircraft | null; now: number; watched: boolean; toggleWatch: () => void; focus: () => void; fullRoute: () => void; trail: TrailPoint[]; error: string; runways: Runway[]; replayIndex: number | null; setReplay: (n: number | null) => void; route: FlightRoute | null; routeLoading: boolean; routeError: string; following: boolean; close: () => void; }
export function Inspector(p: Props) {
  const a = p.aircraft;
  if (!a) return <section className="inspector empty-inspector" aria-label="Aircraft details"><Navigation size={30}/><div className="empty-inspector-copy"><h2>Choose an aircraft to follow</h2><p>Live position, altitude and speed. Clear gaps when coverage ends.</p></div><div className="placeholder-metrics">{['Altitude · ft', 'Ground speed · kt', 'Last seen · UTC'].map(label => <div key={label}><small>{label}</small><strong>—</strong></div>)}</div><div className="source-mini">Live aircraft observations</div></section>;
  const age = ageSeconds(a, p.now); const runway = inferRunway(a, p.runways, p.now);
  const replay = p.replayIndex === null ? null : p.trail[p.replayIndex];
  const exportTrail = () => {
    const blob = new Blob([JSON.stringify({ sources: [...new Set([a.positionSource??'adsblol',...p.trail.map(pt=>pt.positionSource??'adsblol')])].map(id=>id==='flyitaly'?{id,name:'FlyItalyADSB',license:'CC BY-SA 4.0',url:'https://flyitalyadsb.com/'}:{id,name:'ADSB.lol',license:'ODbL-1.0',url:'https://www.adsb.lol/'}), aircraft: a, observations: p.trail }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `skyward-${a.hex}-observations.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="inspector selected-inspector" aria-label="Aircraft details"><SheetHandle/>
    <div className="inspector-top"><div><div className="flight-identity"><h2>{flightDisplayCode(a.callsign) || a.registration || a.hex.toUpperCase()}</h2><span className={`observation-label ${age > 30 || replay ? 'warning' : 'mint'}`}><i className={`status-dot ${age > 30 || replay ? 'amber' : ''}`}/>{replay ? 'Recorded observation' : freshness(a, p.now)}</span></div><p>{airline(a)} <span>·</span> {aircraftNames[a.aircraftType] || a.aircraftType || 'Aircraft type unknown'} <span>·</span> {a.registration || 'Registration unknown'}</p></div><div className="inspector-actions"><button className="quiet-button" onClick={p.compare}>Compare flight</button><button className={`icon-button ${p.watched ? 'is-watched' : ''}`} onClick={p.toggleWatch} disabled={!!a.simulation} aria-label={p.watched ? 'Remove from watchlist' : 'Add to watchlist'} title="Save aircraft"><Star size={19} fill={p.watched ? 'currentColor' : 'none'}/></button><button className="quiet-button" onClick={p.focus} disabled={a.lat === null}><Crosshair size={15}/>{p.following ? 'Following · stop' : 'Follow'}</button><button className="icon-button" aria-label="Close aircraft details" onClick={p.close}><X size={17}/></button></div></div>
    {!replay&&<JourneyDetails reducedMotion={p.reducedMotion} key={a.hex} aircraft={a} route={p.route} trail={p.trail} now={p.now}/>}
    {!replay&&<RouteOverview aircraft={a} route={p.route} trail={p.trail} now={p.now} loading={p.routeLoading} error={p.routeError} showRoute={p.fullRoute}/>}

    <CabinPassengers aircraft={a}/><AircraftIdentity aircraft={a}/><FlightSummary aircraft={a} points={p.replayIndex===null?p.trail:p.trail.slice(0,p.replayIndex+1)}/>{a.positionWarning&&<p className="warning" role="status">Position quality: {a.positionWarning} · retaining last accepted fix.</p>}
    {!replay&&<MotionDiagnostics aircraft={a} points={p.trail} now={p.now} reduced={p.reducedMotion} quality={p.quality} {...p.feedHealth}/>}
    {!a.simulation&&!replay&&a.targetKind==='aircraft'&&<p className="airport-note">{motionStatus(p.trail,p.now,p.reducedMotion)}</p>}
    {!a.simulation&&<p className="target-class">{kindLabel(a)} · {a.category?`reported emitter category ${a.category}`:'emitter category unavailable'}. Classification is supplied by the feed; missing classes stay unknown.</p>}
    <div className="metrics"><div><small>Altitude</small><strong>{(replay?.ground ?? a.ground) ? 'Ground' : (replay?.altitude ?? a.altitude)?.toLocaleString() ?? '—'}{!(replay?.ground ?? a.ground) && <em> ft</em>}</strong></div><div><small>Ground speed</small><strong>{replay ? replay.groundSpeed??'—' : a.groundSpeed === null ? '—' : Math.round(a.groundSpeed)}<em> kt</em></strong></div><div><small>Heading</small><strong>{replay ? '—' : a.heading === null ? '—' : `${Math.round(a.heading)}°`}</strong></div><div><small>{replay ? 'Recorded at · UTC' : 'Last position'}</small><strong className="last-seen">{a.simulation?'Simulated':replay ? new Date(replay.time).toISOString().slice(11, 19) : duration(age)}</strong></div><div><small>Flight phase</small><strong className="phase">{replay ? 'Replay' : phase(a)}</strong></div></div>
    <div className="route-facts"><span>Runway <b>{replay ? 'Unknown in replay' : runway ? `${runway} · inferred alignment` : 'Not confirmed'}</b></span><span>Gate <b>Not supplied by feed</b></span></div>
    {!a.simulation&&(p.error || age > 120) && <div className="coverage-warning" role="status"><Radio size={14}/>{p.error || 'Coverage gap. The aircraft remains at its last observed position.'}</div>}
    <div className="trail-controls"><span>{p.trail.length} observations <span className="desktop-copy">collected this session</span></span><div><button className="text-button" disabled={p.trail.length < 2} onClick={() => p.setReplay(p.replayIndex === null ? 0 : null)}>{replay ? <X size={13}/> : <Play size={13}/>} {replay ? 'Return to live' : 'Replay trail'}</button><button className="icon-button" disabled={!p.trail.length} onClick={exportTrail} aria-label="Download observed trail"><Download size={15}/></button></div></div>
    {p.replayIndex !== null && <ReplayTimeline key={a.hex} points={p.trail} index={p.replayIndex} change={p.setReplay}/>}

  </section>;
}
