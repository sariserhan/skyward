import {useEffect,useMemo,useState} from 'react';
import type {Aircraft} from '../types';
import type {Catalog} from '../lib/airframeCatalog';
import {loadAirframeCatalog} from '../lib/airframeLibrary';
import {liveCandidates,liveCollections} from '../lib/liveCollections';
import './LiveCollections.css';

export function LiveCollections({aircraft,now,select}:{aircraft:Aircraft[];now:number;select:(a:Aircraft)=>void}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let cancelled=false;loadAirframeCatalog().then(c=>{if(!cancelled)setCatalog(c);}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[]);
 const rows=useMemo(()=>catalog?liveCollections(catalog,aircraft,now):[],[catalog,aircraft,now]);
 const featured=useMemo(()=>catalog?catalog.entities.filter(e=>liveCandidates(catalog,now,e.id).length>0).sort((a,b)=>Number(b.entityType==='SPORTS_TEAM')-Number(a.entityType==='SPORTS_TEAM')).slice(0,3):[],[catalog,now]);
 return <section className="live-collections" aria-label="Watch teams and fleets">
  <header className="live-collections-heading"><span className="live-collections-kicker">A FRONT-ROW SEAT TO THE SKIES</span><h3>Watch teams &amp; fleets</h3></header>
  <div className="live-collections-content">
   <p>Catch team aircraft and distinctive fleets in flight. Pick a collection to find an aircraft to watch.</p>
   {rows.slice(0,3).map(({aircraft:a,names,relationship})=><button key={a.hex} onClick={()=>select(a)} aria-label={`Watch ${names} aircraft live`}><strong>Watch {names} aircraft live</strong><small>{relationship}</small><span>{a.callsign||a.registration} · Watch live →</span></button>)}
   {!rows.length&&<p role="status">{failed?'Aircraft collections could not load.':!catalog?'Loading collections…':'No matching airborne aircraft detected in the loaded map area.'}</p>}
   <nav className="live-collection-shortcuts" aria-label="Featured aircraft collections">{featured.map(e=><a key={e.id} href={`/notable-aircraft/?collection=${encodeURIComponent(e.id)}`}>{e.displayName}<span>Find airborne aircraft →</span></a>)}</nav>
   <small>Recent observations only. Coverage varies; aircraft associations do not identify passengers.</small>
   <a className="live-collections-browse" href="/notable-aircraft/">Browse all teams &amp; fleets →</a><a href="/following/">Your followed aircraft →</a>
  </div>
 </section>;
}
