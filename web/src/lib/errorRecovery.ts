import type {Aircraft} from '../types';
import {parseCamera} from './sharedCamera.ts';
export interface RecoverySnapshot {hash:string;time:number;aircraft?:Aircraft;synthetic?:string;following?:boolean;}
const key='skyward.error-recovery.v1';
let provider:(()=>RecoverySnapshot|null)|null=null,last:RecoverySnapshot|null=null,restored:RecoverySnapshot|null=null,consumed=false;
export function registerRecoveryProvider(read:()=>RecoverySnapshot|null){provider=read;captureRecovery();return()=>{if(provider===read)provider=null;};}
export function captureRecovery(){try{const snapshot=provider?.();if(snapshot)last=snapshot;}catch{/* Retain the last healthy snapshot if the viewer has already failed. */}return last;}
export function parseRecovery(raw:string|null,now=Date.now()):RecoverySnapshot|null{
 try{if(!raw||raw.length>2000000)return null;const value=JSON.parse(raw);if(typeof value.hash!=='string'||value.hash.length>1000||!Number.isFinite(value.time)||value.time>now+60000||now-value.time>3600000)return null;
 const q=new URLSearchParams(value.hash.replace(/^#/,''));if(!q.has('airport'))return null;
 const a=value.aircraft;if(a&&(['callsign','registration','aircraftType','sourceType'].some(k=>typeof a[k]!=='string')||!/^[a-f\d]{6}$/i.test(a.hex)||!Number.isFinite(a.lat)||Math.abs(a.lat)>90||!Number.isFinite(a.lon)||Math.abs(a.lon)>180||!Number.isFinite(a.observedAt)||a.simulation))delete value.aircraft;
 return {hash:value.hash,time:value.time,aircraft:value.aircraft,synthetic:typeof value.synthetic==='string'?value.synthetic:undefined,following:value.following===true};
 }catch{return null;}
}
// React may retry the initial render. Consume storage once, but retain the result for this page load.
export function consumeErrorRecovery(){if(consumed)return restored;consumed=true;try{const raw=sessionStorage.getItem(key);sessionStorage.removeItem(key);restored=parseRecovery(raw);}catch{restored=null;}return restored;}
export function restoredRecovery(){return restored;}
export function recoveryCamera(){return restored?parseCamera(new URLSearchParams(restored.hash.replace(/^#/, '')).get('camera')):null;}
export function reloadWithRecovery(){
 const snapshot=captureRecovery();if(snapshot){try{sessionStorage.setItem(key,JSON.stringify(snapshot));}catch{try{history.replaceState(history.state,'',location.pathname+location.search+snapshot.hash);}catch{}}}
 location.reload();
}
