import {useSpecialFlights} from '../lib/useSpecialFlights';
import './LiveCollections.css';
export function LiveCollections(){
 const snapshot=useSpecialFlights();
 return <section className="live-collections" aria-label="Watch teams and fleets">
  <header className="live-collections-heading"><span className="live-collections-kicker">AIRBORNE AROUND THE WORLD</span><h3>Watch teams &amp; icons</h3></header>
  <div className="live-collections-content">
   <p>Special aircraft worldwide, wherever you are looking.</p>
   <div className="special-aircraft-list">{snapshot.rows.map(row=><a className="special-aircraft-watch" key={row.aircraftId} href={row.path+'#scene=flight&view=side'} aria-label={`Watch ${row.name} aircraft live`}><strong>{row.name}</strong><small>{row.relationship}</small><span>{row.registration} · Airborne · Watch →</span></a>)}</div>
   {snapshot.state==='loading'?<p role="status">Checking special aircraft worldwide…</p>:snapshot.state==='unavailable'?<p role="status">Worldwide check unavailable. Retrying automatically.</p>:<p role="status">{snapshot.rows.length?`${snapshot.rows.length} airborne matches`:'No recent airborne matches received worldwide.'} · {snapshot.checkedAircraft}/{snapshot.totalAircraft} aircraft checked{snapshot.state==='partial'?' · Partial coverage':''}</p>}
   <small>Updates about once a minute. Coverage varies; branding does not identify passengers.</small>
   <a className="live-collections-browse" href="/notable-aircraft/">Explore worldwide aircraft →</a><a href="/following/">Your followed aircraft →</a>
  </div>
 </section>;
}
