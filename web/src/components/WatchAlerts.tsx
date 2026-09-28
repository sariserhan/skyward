import {destinationAlert,type AlertDestination} from '../lib/destinationAlerts';
import { useEffect, useRef, useState } from 'react';
import type { Aircraft } from '../types';
import type { WatchItem } from '../lib/useObservatory';
import { observeAlerts, type AlertState, type LocalEvent } from '../lib/experience';
export function WatchAlerts({watches,observations,now,enabled,setEnabled,destinations}:{destinations:Map<string,AlertDestination>;watches:WatchItem[];observations:Aircraft[];now:number;enabled:boolean;setEnabled:(b:boolean)=>void}){
  const states=useRef(new Map<string,AlertState>()),[events,setEvents]=useState<LocalEvent[]>([]);
  const [desktop,setDesktop]=useState(false),[notificationMessage,setNotificationMessage]=useState('');
  const active=watches.slice(-5),activeKey=active.map(a=>a.hex).join(',');
  useEffect(()=>{
    const keys=new Set(activeKey.split(','));
    for(const hex of states.current.keys())if(!keys.has(hex)||!enabled)states.current.delete(hex);
    if(!enabled||document.hidden)return;
    const next:LocalEvent[]=[];
    for(const hex of keys){const a=observations.find(a=>a.hex===hex)??states.current.get(hex)?.last;if(!a)continue;
      const near=destinationAlert(states.current.get(hex)?.last,a,destinations.get(hex),now);if(near)next.push(near);const result=observeAlerts(states.current.get(hex),a,now);states.current.set(hex,result.state);next.push(...result.events);}
    if(next.length){setEvents(old=>[...next,...old].slice(0,40));if(desktop&&'Notification' in window&&Notification.permission==='granted'){try{const notice=new Notification('Skyward flight alert',{body:next.map(e=>e.title).join('\n').slice(0,600),tag:'skyward-flight-alert'});setTimeout(()=>notice.close(),10000);}catch{setDesktop(false);setNotificationMessage('Browser notifications are unavailable; alerts remain here.');}}}
  },[activeKey,observations,now,enabled,destinations,desktop]);
  return <details className="watch-alerts"><summary>Local watch alerts {events.length>0?`· ${events.length}`:''}</summary><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Monitor watched aircraft</label><p>While this page is visible, monitors your {active.length} most recently saved aircraft (maximum 5), approximately once every 30 seconds each. Alerts require this page to remain visible. No background service or email. Destination alerts use route information already loaded for a watched flight; inferred approach alerts never confirm a landing.</p>{enabled&&<p>{active.map(a=>a.callsign||a.hex).join(' · ')||'Star an aircraft to begin.'}</p>}<p role="status" aria-live="polite">{enabled&&events[0]?`Latest alert: ${events[0].title}`:""}</p><button disabled={!enabled} onClick={async()=>{if(desktop){setDesktop(false);return;}if(!('Notification' in window)){setNotificationMessage('This browser does not support desktop notifications.');return;}try{const permission=await Notification.requestPermission();setDesktop(permission==='granted');setNotificationMessage(permission==='granted'?'Notifications enabled for this session.':'Notifications were not enabled. Alerts still appear here.');}catch{setNotificationMessage('Notifications are unavailable. Alerts still appear here.');}}}>{desktop?'Disable browser notifications':'Enable browser notifications'}</button>{notificationMessage&&<p role="status">{notificationMessage}</p>}<ol aria-label="Watch alert history">{events.map(e=><li key={e.id}><time>{new Date(e.time).toISOString().slice(11,19)} UTC</time>{e.title}</li>)}</ol>{!events.length&&<p>No alert events this session.</p>}{events.length>0&&<button className="text-button" onClick={()=>setEvents([])}>Clear alerts</button>}</details>;
}
