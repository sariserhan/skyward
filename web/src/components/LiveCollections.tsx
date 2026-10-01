import {useEffect,useMemo,useState} from 'react';
import type {Aircraft} from '../types';
import type {Catalog} from '../lib/airframeCatalog';
import {loadAirframeCatalog} from '../lib/airframeLibrary';
import {eligibleLiveCandidates,liveCollections} from '../lib/liveCollections';
import {isNotableAircraft} from '../lib/notableDirectory';
import './LiveCollections.css';

export function LiveCollections({aircraft,now,select}:{aircraft:Aircraft[];now:number;select:(a:Aircraft)=>void}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let cancelled=false;loadAirframeCatalog().then(c=>{if(!cancelled)setCatalog(c);}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[]);
 const rows=useMemo(()=>catalog?liveCollections(catalog,aircraft,now):[],[catalog,aircraft,now]);
 const featured=useMemo(()=>{if(!catalog)return [];const priority=['new-england-patriots','manchester-city','pok-mon-jets','flying-bulls'];const eligible=new Set(eligibleLiveCandidates(catalog,now).filter(isNotableAircraft).map(a=>a.id));return priority.flatMap(id=>catalog.entities.filter(e=>e.id===id&&catalog.associations.some(s=>s.entityId===id&&eligible.has(s.aircraftId))));},[catalog,now]);
 return <section className="live-collections" aria-label="Watch teams and fleets">
  <header className="live-collections-heading"><span className="live-collections-kicker">A FRONT-ROW SEAT TO THE SKIES</span><h3>Watch teams &amp; icons</h3></header>
  <div className="live-collections-content">
   <p>Team jets, Pokémon, Formula 1 and Red Bull. Find a distinctive aircraft and watch its journey.</p>
   {rows.slice(0,3).map(({aircraft:a,names,relationship})=><button key={a.hex} onClick={()=>select(a)} aria-label={`Watch ${names} aircraft live`}><strong>Watch {names} aircraft live</strong><small>{relationship}</small><span>{a.callsign||a.registration} · Watch live →</span></button>)}
   {!rows.length&&<p role="status">{failed?'Aircraft collections could not load.':!catalog?'Loading collections…':'No matching airborne aircraft detected in the loaded map area.'}</p>}
   <nav className="live-collection-shortcuts" aria-label="Featured aircraft collections">{featured.map(e=><a key={e.id} href={`/notable-aircraft/?collection=${encodeURIComponent(e.id)}`}>{e.displayName}<span>Find airborne aircraft →</span></a>)}</nav>
   <small>Recent observations only. Coverage varies; aircraft associations do not identify passengers.</small>
   <a className="live-collections-browse" href="/notable-aircraft/">Explore worldwide aircraft →</a><a href="/following/">Your followed aircraft →</a>
  </div>
 </section>;
}
