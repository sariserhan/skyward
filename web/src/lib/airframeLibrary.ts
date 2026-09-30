import {canonicalId,normalizedFollows,type Catalog} from './airframeCatalog';
const key='skyward.airframe-follows.v1';
export function readAirframeFollows(c:Catalog){try{const ids=JSON.parse(localStorage.getItem(key)??'[]');if(!Array.isArray(ids))return [];return [...new Set(ids.slice(0,50).flatMap((id:unknown)=>{try{return typeof id==='string'?[canonicalId(c,id)]:[];}catch{return [];}}))];}catch{return [];}}
export function writeAirframeFollows(c:Catalog,ids:string[]){const next=normalizedFollows(c,ids);localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event('skyward-airframe-follows'));return next;}
let pending:Promise<Catalog>|undefined;
export function loadAirframeCatalog(){return pending??=(async()=>{try{const r=await fetch('/watch/data/airframes.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Aircraft directory unavailable.');return await r.json() as Catalog;}catch(e){pending=undefined;throw e;}})();}
