import {useEffect,useMemo,useState} from 'react';
import type {Aircraft} from '../types';
import type {Catalog} from '../lib/airframeCatalog';
import {loadAirframeCatalog} from '../lib/airframeLibrary';
import {liveCollections} from '../lib/liveCollections';
import './LiveCollections.css';

export function LiveCollections({aircraft,now,select}:{aircraft:Aircraft[];now:number;select:(a:Aircraft)=>void}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let cancelled=false;loadAirframeCatalog().then(c=>{if(!cancelled)setCatalog(c);}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[]);
 const rows=useMemo(()=>catalog?liveCollections(catalog,aircraft,now):[],[catalog,aircraft,now]);
 return <details className="live-collections">
  <summary><span className="live-collections-kicker">WATCH LIVE</span><span>Teams &amp; fleets <span aria-hidden="true">↗</span></span><small>Find a story in the skies{rows.length?` · ${rows.length} airborne`:''}</small></summary>
  <div className="live-collections-content">
   <p>Team jets. Iconic fleets. Watch an aircraft in action.</p>
   {rows.map(({aircraft:a,names})=><button key={a.hex} onClick={()=>select(a)} aria-label={`Watch ${a.callsign||a.registration} live`}><strong>{names}</strong><span>{a.callsign||a.registration} · Watch live →</span></button>)}
   {!rows.length&&<p role="status">{failed?'Aircraft collections could not load.':!catalog?'Loading collections…':'No matching airborne aircraft detected in the loaded map area.'}</p>}
   <small>Recent observations only. Coverage varies; aircraft associations do not identify passengers.</small>
   <a href="/notable-aircraft/">Browse the reference directory →</a>
  </div>
 </details>;
}
