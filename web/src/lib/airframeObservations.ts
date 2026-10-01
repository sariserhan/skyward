import {canonicalId,identityAt,type Airframe,type Catalog} from './airframeCatalog.ts';
export type AirframeObservation={hex:string;registration:string;observedAt:number;lat:number;lon:number;altitude:number|null;groundSpeed:number|null;ground?:boolean};
export type ObservationSnapshot={row:AirframeObservation|null;source:string;checkedAt:number};
const KEY='skyward.airframe-observations.v1',TTL=30*60000,MAX=10;
/** Original observations only; never projected coordinates or a simulated landing. */
export function matchAirframeObservation(c:Catalog,a:Airframe,input:unknown,now=Date.now()):AirframeObservation|null{
 if(!Array.isArray(input)||a.retired||a.status==='HISTORICAL'||a.status==='UNVERIFIED')return null;
 const rows:AirframeObservation[]=[];
 for(const r of input.slice(0,5000)){
  if(!r||r.simulation||!Number.isFinite(r.observedAt)||r.observedAt<=0||r.observedAt>now+30000||now-r.observedAt>TTL||!Number.isFinite(r.lat)||Math.abs(r.lat)>90||!Number.isFinite(r.lon)||Math.abs(r.lon)>180||typeof r.hex!=='string'||!/^[a-f0-9]{6}$/.test(r.hex))continue;
  const day=new Date(r.observedAt).toISOString().slice(0,10),reg=identityAt(a,'registrations',day)?.value,hex=identityAt(a,'icaoIdentities',day)?.value;
  if(!reg||r.registration!==reg||(hex&&r.hex!==hex))continue;
  // Even a single returned row is ambiguous if the catalog assigns its identifiers
  // to another physical aircraft in the same period.
  const conflict=c.aircraft.some(other=>canonicalId(c,other.id)!==a.id&&(identityAt(other,'registrations',day)?.value===reg||identityAt(other,'icaoIdentities',day)?.value===r.hex));
  if(conflict)continue;
  rows.push({hex:r.hex,registration:reg,observedAt:r.observedAt,lat:r.lat,lon:r.lon,altitude:Number.isFinite(r.altitude)?r.altitude:null,groundSpeed:Number.isFinite(r.groundSpeed)&&r.groundSpeed>=0?r.groundSpeed:null,...(typeof r.ground==='boolean'?{ground:r.ground}:{})});
 }
 // Different addresses must not be collapsed just because they use the same tail.
 if(new Set(rows.map(r=>r.hex)).size!==1)return null;
 return rows.sort((a,b)=>b.observedAt-a.observedAt)[0]??null;
}
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
function entries(storage:StorageAccess,now:number):Record<string,ObservationSnapshot>{try{const text=storage.getItem(KEY);if(!text||text.length>20000)return {};const raw=JSON.parse(text);if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};return Object.fromEntries(Object.entries(raw).filter(([id,v])=>/^[a-z][a-z0-9-]{1,63}$/.test(id)&&v&&typeof v==='object'&&Number.isFinite((v as ObservationSnapshot).checkedAt)&&(v as ObservationSnapshot).checkedAt<=now&&now-(v as ObservationSnapshot).checkedAt<TTL).slice(-MAX)) as Record<string,ObservationSnapshot>;}catch{return {};}}
export function readObservation(storage:StorageAccess,c:Catalog,a:Airframe,now=Date.now()):ObservationSnapshot{
 const stored=entries(storage,now)[a.id];if(!stored)return {row:null,source:'',checkedAt:0};
 return {row:matchAirframeObservation(c,a,[stored.row],now),source:typeof stored.source==='string'?stored.source.slice(0,160):'',checkedAt:stored.checkedAt};
}
export function saveObservation(storage:StorageAccess,id:string,snapshot:ObservationSnapshot,now=Date.now()){
 const saved=entries(storage,now);delete saved[id];saved[id]={row:snapshot.row,source:snapshot.source.slice(0,160),checkedAt:now};const bounded=Object.fromEntries(Object.entries(saved).slice(-MAX));try{storage.setItem(KEY,JSON.stringify(bounded));}catch{/* A denied/full cache must not prevent an explicit observation check. */}
}
