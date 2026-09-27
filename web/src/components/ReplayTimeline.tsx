import {HistoryCharts} from './HistoryCharts';
import { useEffect, useRef, useState } from 'react';
import type { TrailPoint } from '../types';
export function ReplayTimeline({points,index,change}:{points:TrailPoint[];index:number;change:(n:number|null)=>void}) {
  const [playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
  const safe=Math.min(index,points.length-1),current=points[safe];
  const latest=useRef(change);latest.current=change;
  useEffect(()=>{
    if(!playing)return;
    if(safe>=points.length-1){setPlaying(false);return;}
    const timer=setTimeout(()=>{if(!document.hidden)latest.current(safe+1);else setPlaying(false);},1000/speed);return()=>clearTimeout(timer);
  },[playing,speed,safe,points.length]);
  if(!current)return null;
  const start=points[0].time,end=points.at(-1)!.time,span=Math.max(1,end-start);
  return <div className="session-timeline"><div className="timeline-actions"><button className="quiet-button" disabled={safe<=0} onClick={()=>{setPlaying(false);change(safe-1);}}>Previous fix</button><button className="quiet-button" disabled={safe>=points.length-1} onClick={()=>{setPlaying(false);change(safe+1);}}>Next fix</button><button className="quiet-button" onClick={()=>{if(safe===points.length-1)change(0);setPlaying(!playing);}}>{playing?'Pause replay':'Play observations'}</button><label>Speed <select aria-label="Replay speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1}>1 fix/s</option><option value={2}>2 fixes/s</option><option value={4}>4 fixes/s</option></select></label><time>{new Date(current.time).toISOString().slice(11,19)} UTC</time></div>
    <div className="timeline-track"><input aria-label="Replay observation" type="range" min={start} max={end} value={current.time} onChange={e=>{setPlaying(false);const t=Number(e.target.value);let nearest=0;for(let i=1;i<points.length;i++)if(Math.abs(points[i].time-t)<Math.abs(points[nearest].time-t))nearest=i;change(nearest);}}/><div className="gap-markers" aria-hidden="true">{points.map((p,i)=>i>0&&p.time-points[i-1].time>120000?<i key={p.time} style={{left:`${(points[i-1].time-start)/span*100}%`,width:`${(p.time-points[i-1].time)/span*100}%`}}/>:null)}</div></div><div className="timeline-labels"><span>{new Date(start).toISOString().slice(11,19)}</span><span>{safe+1}/{points.length} observations</span><span>{new Date(end).toISOString().slice(11,19)}</span></div><p>{safe>0&&current.time-points[safe-1].time>120000?'Coverage gap before this fix. No movement is inferred across the gap.':'Playback steps through observed fixes, not continuous flight time.'} Amber bands mark gaps over two minutes.</p>
    <HistoryCharts points={points} index={safe} change={change}/>
  </div>;
}
