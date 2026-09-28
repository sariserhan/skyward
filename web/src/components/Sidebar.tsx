import {coverageMessage} from '../lib/coverageMessage';
import {TrafficFilters} from './TrafficFilters';
import type {TrafficFilters as Filters} from '../lib/trafficFilters';
import {kindLabel} from '../lib/exploration';
import { searchAirports } from '../lib/airportCatalog';
import type { TrafficFilter } from '../lib/experience';
import { ArrowRight, Crosshair, Plane, Search, Star, ChevronRight, Radio, RefreshCw, X } from 'lucide-react';
import type { Aircraft, AirportId } from '../types';
import { AIRPORTS } from '../types';
import { ageSeconds, duration } from '../lib/aircraft';
import type { WatchItem } from '../lib/useObservatory';
import { useEffect, useMemo, useState } from 'react';
interface Props {filters:Filters;setFilters:(f:Filters)=>void;allAircraft:Aircraft[]; scope:string;trafficFilter: TrafficFilter; setTrafficFilter: (f: TrafficFilter)=>void; airport: AirportId; setAirport: (id: AirportId) => void; focusAirport: (id: AirportId) => void; aircraft: Aircraft[]; selected: Aircraft | null; select: (a: Aircraft) => void; watches: WatchItem[]; watching: boolean; lookup: (kind: string, query: string) => Promise<Aircraft | null>; searching: boolean; searchError: string; error: string; loading: boolean; now: number; updatedAt: number | null; refresh: () => void; }
export function Sidebar(p: Props) {
  const [airportQuery,setAirportQuery]=useState('');
  const [airportSearchOpen,setAirportSearchOpen]=useState(false);
  const airportResults=useMemo(()=>searchAirports(airportQuery),[airportQuery]);
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('callsign');
  useEffect(()=>setQuery(''),[p.airport]);
  const rows = useMemo(() => p.aircraft.filter(a => (!query || `${a.callsign} ${a.registration} ${a.hex}`.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => (b.observedAt ?? 0) - (a.observedAt ?? 0) || a.callsign.localeCompare(b.callsign)), [p.aircraft, query]);
  return <aside className="sidebar" aria-label="Aircraft browser">
    <div className="sidebar-title"><h2>{p.watching ? 'Your watchlist' : 'Airspace'}</h2><Radio size={18} className="muted"/></div>
    <div className="airport-directory">
      <label className="search-field"><Search size={17}/><input aria-label="Search airports" placeholder="Airport, city, country or code" value={airportQuery} onFocus={()=>setAirportSearchOpen(true)} onChange={e=>{setAirportQuery(e.target.value);setAirportSearchOpen(true);}} onKeyDown={e=>{if(e.key==='Escape')setAirportSearchOpen(false);}}/>{airportSearchOpen&&<button aria-label="Close airport search" onClick={()=>setAirportSearchOpen(false)}><X size={14}/></button>}</label>
      <small>{Object.keys(AIRPORTS).length.toLocaleString()} major airports worldwide</small>
      {airportSearchOpen&&<div className="airport-results" aria-label="Airport search results"><p>{airportResults.length} matching airports{airportResults.length>30?' · refine search for more':''}</p>{airportResults.slice(0,30).map(([id,a])=><button key={id} onClick={()=>{p.setAirport(id);setAirportSearchOpen(false);setAirportQuery('');}}><strong>{id} <small>{a.icao}</small></strong><span>{a.name}</span><small>{a.city} · {a.country}</small></button>)}{!airportResults.length&&<p>No major airports match. Try a city, country or ICAO code.</p>}</div>}
    </div>
    <div className="airport-choices"><div className="airport-choice selected">
      <button className="airport-main" onClick={()=>p.focusAirport(p.airport)}><Plane size={19}/><span><small>{AIRPORTS[p.airport].name}</small><strong>{p.airport}</strong><small>{AIRPORTS[p.airport].city} · {AIRPORTS[p.airport].country}</small></span></button>
      <button className="icon-button airport-focus" aria-label={`View ${p.airport} airport`} onClick={()=>p.focusAirport(p.airport)}><Crosshair size={17}/></button>
    </div></div>
    <form className="search-form" onSubmit={async e => { e.preventDefault(); if (query.trim()) await p.lookup(kind, query); }}>
      <label className="search-field"><Search size={17}/><input maxLength={12} aria-label="Search aircraft" placeholder="Callsign or registration" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" spellCheck={false}/>{query && <button type="button" className="search-go" aria-label="Clear aircraft search" onClick={()=>setQuery('')}><X size={15}/></button>}{query && <button type="submit" className="search-go" aria-label="Look up aircraft globally" disabled={p.searching}><ArrowRight size={17}/></button>}</label>
      {query && <div className="search-options"><select aria-label="Identifier type" value={kind} onChange={e => setKind(e.target.value)}><option value="callsign">ATC callsign</option><option value="registration">Registration</option><option value="hex">ICAO hex</option></select><button type="submit" disabled={p.searching}>{p.searching ? 'Looking up…' : 'Search worldwide'}</button></div>}
    </form>
    {p.searchError && <p className="inline-message" role="status">{p.searchError}</p>}
    {!p.watching&&<TrafficFilters value={p.filters} change={p.setFilters} aircraft={p.allAircraft} airport={p.airport}/>}
    {!p.watching&&<label className="traffic-select">Traffic on map & list<select aria-label="Traffic altitude filter" value={p.trafficFilter} onChange={e=>p.setTrafficFilter(e.target.value as TrafficFilter)}><option value="all">All targets</option><option value="aircraft">Classified aircraft</option><option value="vehicles">Surface vehicles</option><option value="fixed">Fixed objects / transmitters</option><option value="unknown">Unclassified targets</option><option value="ground">On ground</option><option value="airborne">Airborne</option><option value="low">Below 10,000 ft</option><option value="high">10,000 ft and above</option></select></label>}
    <div className="list-context">{p.watching ? 'Saved aircraft · account sync when signed in' : p.scope}</div>
    <div className="aircraft-scroll">
      {p.watching ? <div className="watch-list">{p.watches.length ? p.watches.map(w => <button key={w.hex} className="watch-row" onClick={() => p.lookup('hex', w.hex)}><Star size={16}/><span><strong>{w.callsign || w.registration || w.hex.toUpperCase()}</strong><small>{w.registration || w.hex} · {w.aircraftType || 'Type unknown'}</small></span><ChevronRight size={16}/></button>) : <div className="empty-list"><Star size={26}/><h3>Keep a flight in sight.</h3><p>Select an aircraft and tap the star to save it here. Sign in to sync your watchlist across devices. Guest watches stay in this browser.</p></div>}</div> : <>
        <div className="aircraft-table-head"><span>Callsign</span><span>Type</span><span>Alt · ft</span><span>GS · kt</span></div>
        {p.loading && !rows.length ? <div className="empty-list"><span className="loading-ring"/><p>Listening to the airspace…</p></div> : rows.length ? rows.map(a => <button key={a.hex} className={`aircraft-row ${p.selected?.hex === a.hex ? 'active' : ''} ${ageSeconds(a, p.now) > 120 ? 'stale' : ''}`} onClick={() => p.select(a)} title={`${kindLabel(a)} · ${a.registration || a.hex} · ${duration(ageSeconds(a, p.now))}`} aria-label={`View ${a.callsign || a.registration || a.hex}`}>
          <span className="callsign"><Plane size={14}/>{a.callsign || a.registration || a.hex.toUpperCase()}</span><span>{a.targetKind==='vehicle'?'VEH':a.targetKind==='fixed'?'FIX':a.aircraftType || '—'}</span><span>{a.ground ? 'GND' : a.altitude?.toLocaleString() ?? '—'}</span><span>{a.groundSpeed === null ? '—' : Math.round(a.groundSpeed)}</span>
        </button>) : <div className="empty-list"><Radio size={26}/><h3>{coverageMessage(p.allAircraft,rows.length,p.now,p.loading,p.error,!!query||p.aircraft.length<p.allAircraft.length,navigator.onLine).title}</h3><p>{coverageMessage(p.allAircraft,rows.length,p.now,p.loading,p.error,!!query||p.aircraft.length<p.allAircraft.length,navigator.onLine).detail}</p><button className="text-button" onClick={p.refresh}><RefreshCw size={14}/> Refresh observations</button></div>}
      </>}
    </div>
    <div className="sidebar-footer"><span>{p.watching ? `${p.watches.length} saved aircraft` : `${rows.length} targets reported`}</span><span className={p.error ? 'warning' : 'mint'}><i className={`status-dot ${p.error ? 'amber' : ''}`}/>{p.error ? 'Feed unavailable' : p.updatedAt ? 'Connected' : 'Connecting'}</span></div>
  </aside>;
}
