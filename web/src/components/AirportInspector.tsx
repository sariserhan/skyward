import {AirportTimeline} from './AirportTimeline';
import {AirportActivity} from './AirportActivity';
import type {TrailPoint} from '../types';
import { useMemo, useState } from 'react';
import { Plane, RefreshCw, X } from 'lucide-react';
import { AIRPORTS, type Aircraft, type AirportGeometry, type AirportId, type FacilityTarget } from '../types';
import {kindLabel} from '../lib/exploration';
import { ageSeconds, duration } from '../lib/aircraft';
export function distanceNm(lat: number, lon: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180, a = Math.sin((lat2-lat)*rad/2)**2 + Math.cos(lat*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon)*rad/2)**2;
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function airportFacilities(geometry: AirportGeometry | undefined): FacilityTarget[] {
  if (!geometry) return [];
  const airport = geometry.id;
  return [
    ...geometry.runways.map(r => ({airport, kind:'runway', points:[r.a,r.b], width:r.width, lon: (r.a[0]+r.b[0])/2, lat: (r.a[1]+r.b[1])/2, label: `Runway ${r.id}`, range: Math.max(2500, r.length*1.5)})),
    ...geometry.surfaces.filter(s => s.kind !== 'apron').map((s, i) => ({airport, kind:s.kind, points:s.points, lon: s.points.reduce((n,p) => n+p[0],0)/s.points.length, lat: s.points.reduce((n,p) => n+p[1],0)/s.points.length, label: s.label || `Unnamed ${s.kind} footprint ${i+1}`, range: s.kind === 'terminal' ? 2400 : 1000})),
    ...geometry.gates.map(g => ({airport, kind:'gate', lon:g.position[0], lat:g.position[1], label:`Gate ${g.label}`, range:650})),
  ].map((f,i)=>({...f,id:`facility-${airport}-${i}`})) as FacilityTarget[];
}
interface Props {airport3D:()=>void;observations:Aircraft[];retryGeometry:()=>void;histories:Map<string,TrailPoint[]>;board:()=>void;tower:()=>void; overview:()=>void; geometryError?: boolean; selected?: FacilityTarget; airport: AirportId; geometry: AirportGeometry | undefined; aircraft: Aircraft[]; now: number; updatedAt: number | null; loading: boolean; error: string; refresh: () => void; focus: (target: FacilityTarget) => void; select: (a: Aircraft) => void; close: () => void; }
export function AirportInspector(p: Props) {
  const airport = AIRPORTS[p.airport];
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('all');
  const [traffic,setTraffic]=useState<'all'|'ground'|'airborne'>('all');
  const facilities = useMemo(() => airportFacilities(p.geometry), [p.geometry]);
  const matchingFacilities=facilities.map((f,i)=>({f,i})).filter(({f})=>(kind==='all'||f.kind===kind)&&f.label.toLowerCase().includes(query.toLowerCase()));
  const near = p.aircraft.filter(a => a.lat !== null && a.lon !== null && distanceNm(a.lat,a.lon,airport.lat,airport.lon) <= 5);
  const displayed=near.filter(a=>traffic==='all'||(traffic==='ground'?a.ground:!a.ground));
  const fresh = near.filter(a => ageSeconds(a,p.now)<=30);
  return <section className="inspector airport-inspector" aria-label="Airport details and traffic">
    <div className="inspector-top"><div><h2>{p.airport} · Airport & live traffic</h2><p>{airport.name} · Click mapped facilities or use the selector.</p></div><div className="inspector-actions"><a className="quiet-button" href={`/airports/${p.airport}/board/`}>Arrivals &amp; departures</a><button className="quiet-button" onClick={p.board}>Observed traffic</button><button className="quiet-button" disabled={!p.geometry} onClick={p.overview}>Overview</button><button className="quiet-button" disabled={!p.geometry} onClick={p.airport3D}>3D airport</button><button className="quiet-button" disabled={!p.geometry?.runways.length} onClick={p.tower}>Tower view</button><button className="icon-button" aria-label="Refresh airport traffic" disabled={p.loading} onClick={p.refresh}><RefreshCw size={16}/></button><button className="icon-button" aria-label="Close airport details" onClick={p.close}><X size={18}/></button></div></div>
    {p.geometryError&&<button className="quiet-button" onClick={p.retryGeometry}>Retry airport map</button>}
    <AirportTimeline rows={p.observations} histories={p.histories} center={airport} now={p.now} select={p.select}/>
    <AirportActivity airport={p.airport} aircraft={p.aircraft} histories={p.histories} geometry={p.geometry} now={p.now} select={p.select}/>
    <div className="airport-stats"><span><b>{p.geometry?.runways.length ?? '—'}</b> mapped runways</span><span><b>{p.geometry?.gates.length ?? '—'}</b> mapped gates</span><span><b>{p.geometry?.surfaces.filter(s=>s.kind!=='apron').length ?? '—'}</b> building footprints</span><span><b>{fresh.length}</b> fresh targets within 5 nm</span></div>
    <p className="airport-note">{!p.geometry ? (p.geometryError ? 'Mapped facilities unavailable. Traffic connection status is shown separately.' : 'Loading mapped facilities…') : `Coverage: runways ${p.geometry.coverage?.runways ?? 'mapped'} · buildings ${p.geometry.coverage?.buildings ?? 'partial'} · gates ${p.geometry.coverage?.gates ?? 'partial'}. Mapped counts are not a complete inventory.`}</p>
    {p.selected?.kind==='airport3d'&&<p className="airport-note" role="status">{p.geometry?.surfaces.some(s=>s.kind!=='apron')?'Mapped buildings in 3D · heights are approximate. Drag to orbit; scroll to explore.':'No building footprints available here yet. Runways and mapped facilities remain visible.'}</p>}
    <p className="airport-note">Reported classes: {near.filter(a=>a.targetKind==='aircraft').length} aircraft · {near.filter(a=>a.targetKind==='vehicle').length} vehicles · {near.filter(a=>a.targetKind==='fixed').length} fixed objects · {near.filter(a=>!a.targetKind||a.targetKind==='unknown').length} unclassified</p>
    <div className="facility-tabs" aria-label="Facility category">{[['all','All facilities'],['terminal','Terminals'],['runway','Runways'],['gate','Gates']].map(([k,label])=>{const available=facilities.some(f=>k==='all'||f.kind===k);return <button key={k} disabled={!available} title={available?undefined:!p.geometry?(p.geometryError?'Mapped facilities unavailable':'Loading mapped facilities…'):`No mapped ${label.toLowerCase()} at ${p.airport}`} aria-pressed={kind===k} onClick={()=>setKind(k)}>{label}</button>;})}</div>
    <p className="airport-note" role="status">{matchingFacilities.length} matching mapped facilities · coverage is partial unless explicitly documented.</p>
    {p.selected && <p className="selected-facility" role="status">Selected: {p.selected.label} · highlighted on map</p>}
    <label className="facility-picker">Explore facilities<input className="facility-search" aria-label="Filter airport facilities" placeholder="Find a gate or runway" value={query} onChange={e=>setQuery(e.target.value)}/><select disabled={!matchingFacilities.length} aria-label="Airport facility" value={p.selected?.id ? String(facilities.findIndex(f=>f.id===p.selected?.id)) : ""} onChange={e=>{ const f=facilities[Number(e.target.value)]; if(f)p.focus(f); }}><option value="" disabled>Choose a mapped facility…</option>{matchingFacilities.map(({f,i})=><option value={i} key={i}>{f.label}</option>)}</select></label>
    {p.geometry && !matchingFacilities.length && <p className="airport-note" role="status">No mapped facilities match this category{query?` and “${query}”`:""}.</p>}
    <div className="airport-traffic"><h3>Airport area · 5 nm <small>{near.length} reported · {near.filter(a=>a.ground).length} on ground</small></h3>
      <div className="traffic-filter" aria-label="Airport traffic filter">{(['all','ground','airborne'] as const).map(t=><button key={t} aria-pressed={traffic===t} onClick={()=>setTraffic(t)}>{t==='all'?'All traffic':t==='ground'?'On ground':'Airborne'}</button>)}</div>
      {p.loading ? <p>Loading observations for {p.airport}…</p> : displayed.length ? <div className="traffic-chips">{displayed.slice().sort((a,b)=>ageSeconds(a,p.now)-ageSeconds(b,p.now)).map(a=><button key={a.hex} onClick={()=>p.select(a)}><Plane size={13}/>{a.callsign || a.registration || a.hex}<small>{a.targetKind==='vehicle'||a.targetKind==='fixed'?kindLabel(a):a.ground ? 'Ground' : `${a.altitude?.toLocaleString() ?? '—'} ft`} · {duration(ageSeconds(a,p.now))}</small></button>)}</div> : <p>No targets reported for this view. This does not mean the airport is empty.</p>}
    </div>
    <p className={p.error ? 'coverage-warning' : 'airport-note'}>{p.error || `Refreshes about every 25 seconds${p.updatedAt ? ` · fetched ${new Date(p.updatedAt).toISOString().slice(11,19)} UTC` : ''}. The aircraft browser follows the camera independently.`}</p>
    <details className="airport-provenance"><summary>Map coverage and traffic limitations</summary><p>{p.geometry?.source || 'Airport map unavailable.'} {p.geometry?.osm && `OpenStreetMap airport-area snapshot ${p.geometry.osm.retrievedAt.slice(0,10)}; partial coverage.`} <a href={airport.sourceUrl} target="_blank" rel="noreferrer">Airport source ↗</a> · Directory snapshot {airport.retrievedAt.slice(0,10)}. Only mapped facilities are shown; map completeness and gate occupancy are not guaranteed. Nearby aircraft are not necessarily arriving or departing here. Surface receiver coverage may be incomplete.</p></details>
  </section>;
}
