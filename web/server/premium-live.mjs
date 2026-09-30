import {fetchAirLabsFlight,fetchAirLabsSchedules} from './airlabs.mjs';
// A real subscription check is deliberately separate from development/test entitlement.
export function createPremiumLive({env,paid,reserve,fetchImpl=fetch,now=Date.now}){
 const enabled=env.SKYWARD_AIRLABS_MODE==='live'&&env.SKYWARD_BILLING_MODE==='live'&&!!env.AIRLABS_API_KEY;
 const cache=new Map(),pending=new Map();
 async function request(u,key,load){
  if(!enabled)throw Object.assign(Error('Live flight details are not enabled. No paid request was made.'),{status:503});
  if(!await paid(u))throw Object.assign(Error('A verified paid subscription is required for live details.'),{status:403});
  const hit=cache.get(key);if(hit&&now()-hit.fetchedAt<300000)return {...hit,cached:true};
  if(pending.has(key))return {...await pending.get(key),cached:true};
  const task=(async()=>{await reserve(u);const result=await load();if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,result);return {...result,cached:false};})();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
 }
 return {enabled,flight:(u,j)=>request(u,`flight:${j.callsign}:${j.hex}:${j.date}:${j.from||''}:${j.to||''}`,()=>fetchAirLabsFlight({apiKey:env.AIRLABS_API_KEY,callsign:j.callsign,hex:j.hex||undefined,date:j.date,from:j.from,to:j.to,fetchImpl,now:now()})),schedules:(u,airport,direction)=>request(u,`board:${airport}:${direction}`,()=>fetchAirLabsSchedules({apiKey:env.AIRLABS_API_KEY,airport,direction,fetchImpl,now:now()}))};
}
