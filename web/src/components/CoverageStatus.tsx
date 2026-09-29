import {coverageMessage} from '../lib/coverageMessage';
import type {Aircraft} from '../types';
import {coverageSummary} from '../lib/flightVisuals';
import {duration} from '../lib/aircraft';
interface Props{suggestions?:React.ReactNode;rows:Aircraft[];now:number;loading:boolean;error:string;updatedAt:number|null;completed:number;total:number;failed:number;limited:boolean;description:string;shown:number;refresh:()=>void;clear?:()=>void;}
export function CoverageStatus(p:Props){
 const counts=coverageSummary(p.rows,p.now),stale=!!p.updatedAt&&p.now-p.updatedAt>120000;
 const message=coverageMessage(p.rows,p.shown,p.now,p.loading,p.error,!!p.clear,navigator.onLine);
 const title=p.loading&&p.rows.length&&!p.error?'Updating traffic':message.title;
 return <aside className={`camera-traffic-status ${p.error||stale?'coverage-warning':''}`} aria-label="Traffic coverage">
  <details className="coverage-details">
  <summary><strong role="status">{title}</strong><span className="coverage-details-label">Details</span></summary>
  <div className="coverage-detail-content"><span className="coverage-description">{p.description}</span>
  <div className="coverage-counts"><span>{counts.fresh} recent</span><span>{counts.aging} aging</span><span>{counts.gap+counts.unknown} old / unknown</span></div>
  <span>{Math.max(0,p.completed-p.failed)}/{p.total} areas received{p.loading?' · updating':''}{p.limited?' · sampled region':''}</span>
  <small>Last successful fetch: {p.updatedAt?duration(Math.max(0,(p.now-p.updatedAt)/1000)):'none yet'}. Newest position: {counts.newest?duration(Math.max(0,(p.now-counts.newest)/1000)):'unavailable'}.</small>
  <small className="coverage-explanation">{message.detail} {p.limited?'Wide views sample regional areas. ':''}Receivers may miss aircraft, especially over oceans or on the ground.</small>
  {p.error&&<span className="coverage-error">{p.error}</span>}
  <div className="coverage-actions"><button disabled={p.loading} onClick={p.refresh}>Refresh traffic</button>{p.clear&&<button onClick={p.clear}>Clear traffic filter</button>}</div>
  </div></details>
  {p.clear&&<button className="active-filter-reset" onClick={p.clear}>Filters active · {p.shown} / {p.rows.length} shown · Reset</button>}
 {p.shown===0&&!p.clear&&p.suggestions}</aside>;
}
