import {travelMetric} from './travelMetrics';
export type Account = {enabled:boolean; authProvider?:'better-auth'; billingReady:boolean; mode:'test'|'live'; liveDetailsReady?:boolean; subscription?:{status:string;premium:boolean;periodEndsAt:number|null;cancelAtPeriodEnd:boolean;canManage:boolean}|null; user:{email:string;premium:boolean}|null; usage:{requests:number;limit:number;month:string;actualProviderSpend:number|null;remaining?:number;resetAt?:number}|null};
export type Journey = {key:string;callsign:string;hex:string;date:string;alerts:boolean};
export async function accountRequest<T>(path:string,body?:unknown):Promise<T> {
  let response:Response;try{response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch(error){travelMetric('client_account_error');throw error;}
  if(response.status>=500)travelMetric('client_account_error');
  const data=await response.json();if(!response.ok)throw new Error((typeof data.error==='string'?data.error:data.message)||'Unable to complete this request.');return data;
}
export const openAccount=()=>window.dispatchEvent(new Event('skyward-account'));

/** Remove this browser's private notification channel before switching accounts. */
export async function disconnectAccountNotifications(){
 if(!('serviceWorker' in navigator)||!('PushManager' in window))return;
 const registration=await navigator.serviceWorker.getRegistration('/'),subscription=await registration?.pushManager.getSubscription();if(!subscription)return;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint)),key=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 let removed=false;try{await accountRequest('/api/premium/notifications',{remove:true,key});removed=true;}catch{}
 try{await subscription.unsubscribe();}catch{if(!removed)throw Error('Unable to disable this device’s private notifications. Please retry signing out.');}
}
