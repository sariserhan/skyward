export type Account = {enabled:boolean; authProvider?:'better-auth'; billingReady:boolean; mode:'test'; user:{email:string;premium:boolean}|null; usage:{requests:number;limit:number;month:string;actualProviderSpend:number}|null};
export type Journey = {key:string;callsign:string;hex:string;date:string;alerts:boolean};
export async function accountRequest<T>(path:string,body?:unknown):Promise<T> {
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error((typeof data.error==='string'?data.error:data.message)||'Unable to complete this request.');return data;
}
export const openAccount=()=>window.dispatchEvent(new Event('skyward-account'));
