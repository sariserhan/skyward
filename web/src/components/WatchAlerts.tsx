import { useEffect, useRef, useState } from 'react';
import type { Aircraft } from '../types';
import type { WatchItem } from '../lib/useObservatory';
import { observeAlerts, type AlertState, type LocalEvent } from '../lib/experience';
export function WatchAlerts({watches,observations,now,enabled,setEnabled}:{watches:WatchItem[];observations:Aircraft[];now:number;enabled:boolean;setEnabled:(b:boolean)=>void}){
  const states=useRef(new Map<string,AlertState>()),[events,setEvents]=useState<LocalEvent[]>([]);
  const active=watches.slice(-5),activeKey=active.map(a=>a.hex).join(',');
  useEffect(()=>{
    const keys=new Set(activeKey.split(','));
    for(const hex of states.current.keys())if(!keys.has(hex)||!enabled)states.current.delete(hex);
    if(!enabled)return;
    const next:LocalEvent[]=[];
    for(const hex of keys){const a=observations.find(a=>a.hex===hex)??states.current.get(hex)?.last;if(!a)continue;
      const result=observeAlerts(states.current.get(hex),a,now);states.current.set(hex,result.state);next.push(...result.events);}
    if(next.length)setEvents(old=>[...next,...old].slice(0,40));
  },[activeKey,observations,now,enabled]);
  return <details className="watch-alerts"><summary>Local watch alerts {events.length>0?`· ${events.length}`:''}</summary><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Monitor watched aircraft</label><p>While this page is visible, monitors your {active.length} most recently saved aircraft (maximum 5), approximately once every 30 seconds each. No background service, email or push notifications.</p>{enabled&&<p>{active.map(a=>a.callsign||a.hex).join(' · ')||'Star an aircraft to begin.'}</p>}<ol aria-label="Watch alert history">{events.map(e=><li key={e.id}><time>{new Date(e.time).toISOString().slice(11,19)} UTC</time>{e.title}</li>)}</ol>{!events.length&&<p>No alert events this session.</p>}{events.length>0&&<button className="text-button" onClick={()=>setEvents([])}>Clear alerts</button>}</details>;
}
