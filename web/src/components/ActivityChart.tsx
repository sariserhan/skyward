import {useMemo,useState} from 'react';
import {activityWindow,type ActivityBin} from '../lib/exploration';
export function ActivityChart({bins,now}:{bins:ActivityBin[];now:number}) {
 const [minutes,setMinutes]=useState(30),[selected,setSelected]=useState<number|null>(null);
 const window=useMemo(()=>activityWindow(bins,now,minutes),[bins,Math.floor(now/60000),minutes]);
 const max=Math.max(1,...window.map(x=>Object.keys(x.bin?.ids??{}).length));
 const active=window.find(x=>x.minute===selected)??window.at(-1)!;
 const values=Object.values(active.bin?.ids??{});
 return <section className="activity-chart" aria-label="Observed airport activity"><h3>Observed activity · within 5 nm</h3><p>Distinct fresh targets seen in each minute during this session. These are observations, not airport operations or passenger counts. Uncollected minutes stay gaps.</p><label>Window <select aria-label="Activity history window" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value="30">30 minutes</option><option value="120">2 hours</option></select></label>
 <div className="activity-bars" aria-label="Activity timeline">{window.map((x,i)=>{const count=Object.keys(x.bin?.ids??{}).length;const label=`${new Date(x.minute).toISOString().slice(11,16)} UTC: ${x.bin?`${count} distinct targets`:'No samples'}`;return <button key={x.minute} tabIndex={x.minute===active.minute?0:-1} aria-label={label} aria-pressed={x.minute===active.minute} title={label} className={x.bin?'sample':'gap'} onClick={()=>setSelected(x.minute)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const j=Math.max(0,Math.min(window.length-1,i+(e.key==='ArrowLeft'?-1:1)));setSelected(window[j].minute);(e.currentTarget.parentElement?.children[j] as HTMLButtonElement)?.focus();}}}><span style={{height:`${x.bin?Math.max(3,count/max*100):100}%`}}/></button>;})}</div>
 <div className="chart-times"><span>{new Date(window[0].minute).toISOString().slice(11,16)} UTC</span><span>Now · current minute is partial</span></div>
 <p role="status">{new Date(active.minute).toISOString().slice(11,16)} UTC · {active.bin?`${values.length} distinct targets: ${values.filter(x=>x==='aircraft').length} aircraft, ${values.filter(x=>x==='vehicle').length} vehicles, ${values.filter(x=>x==='fixed').length} fixed, ${values.filter(x=>x==='unknown').length} unclassified · ${active.bin.samples} source samples.`:'No samples collected. Feed outage, hidden tab, or another airport selected; no zero has been assumed.'}</p></section>;
}
