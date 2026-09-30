import {createTravelers} from './travelers.mjs';
import {createPremiumExtras} from './premium-extras.mjs';
import {randomBytes,createHash} from 'node:crypto';
import webpush from 'web-push';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const digest=s=>createHash('sha256').update(s).digest('hex');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validSubscription(value){
 let url;try{url=new URL(value?.endpoint);}catch{fail(400,'Invalid push subscription.');}
 const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com'];
 if(url.protocol!=='https:'||url.port||url.username||url.password||!hosts.some(h=>url.hostname===h||h==='wns.windows.com'&&url.hostname.endsWith('.'+h))||url.href.length>2048||!value.keys||!/^[-_A-Za-z0-9]{87}$/.test(value.keys.p256dh)||!/^[-_A-Za-z0-9]{22}$/.test(value.keys.auth))fail(400,'Unsupported push subscription.');
 return {endpoint:url.href,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export function createPremiumTools({store,entitlement,userById,readJourney,lookup,listJourneys,observations,env=process.env,now=Date.now,sendPush=webpush.sendNotification}){
 const travelers=createTravelers({store,entitlement,userById,readJourney,observations,now,env});
 const vapid=env.SKYWARD_VAPID_PUBLIC_KEY&&env.SKYWARD_VAPID_PRIVATE_KEY&&env.SKYWARD_VAPID_SUBJECT?{subject:env.SKYWARD_VAPID_SUBJECT,publicKey:env.SKYWARD_VAPID_PUBLIC_KEY,privateKey:env.SKYWARD_VAPID_PRIVATE_KEY}:null;
 const month=()=>new Date(now()).toISOString().slice(0,7),monthlyLimit=30;
 async function eligible(id){const u=await userById(id);return u&&await entitlement(u)?u:null;}
 const extras=createPremiumExtras({store,entitlement,userById,readJourney,listJourneys,observations,notifyVerified,now,env});
 async function handle(path,method,u,b){
  const trip=await travelers.handle(path,method,u,b);if(trip)return trip;
  const extra=await extras.handle(path,method,u,b);if(extra)return extra;
  if(!['/api/premium/monitoring','/api/premium/notifications','/api/premium/shares'].includes(path))return null;
  if(path.endsWith('/notifications')&&method==='POST'&&b.remove){await store.drop(u.id,'push',String(b.key||''));return {ok:true};}
  if(!await entitlement(u))fail(403,'Premium is required for this feature.');
  if(path.endsWith('/monitoring')){
   if(method==='GET')return {items:await store.list(u.id,'monitor'),mode:['neon','d1'].includes(env.SKYWARD_ACCOUNTS)&&env.SKYWARD_AIRLABS_MODE==='live'?'live':'test',monthlyLimit,used:(await store.get(u.id,'monitor-budget',month()))?.used??0,intervalMinutes:15};
   const key=String(b.key||''),j=await readJourney(u.id,key);if(!j)fail(404,'Save this journey first.');
   if(b.enabled===false){await store.drop(u.id,'monitor',key);return {ok:true};}
   const date=Date.parse(j.date);if(!Number.isFinite(date)||date+2*86400000<now()||date>now()+366*86400000)fail(400,'Choose a current or upcoming journey.');
   await store.put(u.id,'monitor',key,{enabled:true,nextAt:Math.max(now(),date-12*3600000),endsAt:date+2*86400000,lastChecked:null,message:['neon','d1'].includes(env.SKYWARD_ACCOUNTS)&&env.SKYWARD_AIRLABS_MODE==='live'?'Queued. Live checks require a verified paid subscription and remaining allowance.':'Queued for a synthetic test check. No live flight alerts are generated.'},10);return {ok:true};
  }
  if(path.endsWith('/notifications')){
   if(method==='GET')return {configured:!!vapid,publicKey:vapid?.publicKey??null,devices:(await store.list(u.id,'push')).map(r=>({key:r.key,created:r.value.created}))};
   if(b.remove){await store.drop(u.id,'push',String(b.key||''));return {ok:true};}
   if(!vapid)fail(503,'Notification delivery needs server configuration.');
   const subscription=validSubscription(b.subscription),key=digest(subscription.endpoint);await store.put(u.id,'push',key,{subscription,created:now()},5);return {ok:true,key};
  }
  if(method==='GET')return {items:(await store.list(u.id,'share')).map(r=>({key:r.key,journeyKey:r.value.journeyKey,expires:r.value.expires}))};
  if(b.remove){await store.drop(u.id,'share',String(b.key||''));return {ok:true};}
  if(![1,24,168].includes(b.hours))fail(400,'Choose a 1-hour, 1-day or 7-day expiry.');
  const j=await readJourney(u.id,String(b.journeyKey||''));if(!j)fail(404,'Save this journey first.');
  for(const r of await store.list(u.id,'share'))if(r.value.expires<=now())await store.drop(u.id,'share',r.key);
  const token=randomBytes(32).toString('hex'),key=digest(token),expires=now()+b.hours*3600000;await store.put(u.id,'share',key,{journeyKey:j.key,expires},20);return {url:'/share/'+token,key,expires};
 }
 async function publicHandle(req,res,url){
  if(await travelers.publicHandle(req,res,url))return true;
  if(await extras.publicHandle(req,res,url))return true;
  if(!url.pathname.startsWith('/share/'))return false;
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  let status=404,content='<h1>This flight link is unavailable.</h1><p>It may have expired or been revoked.</p>';
  try{
   if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Method not allowed.');
   const token=url.pathname.slice(7);if(!/^[a-f0-9]{64}$/.test(token))throw Error();
   if(!await store.claim(`share-view:${digest(req.socket.remoteAddress||'local')}`,now(),1000))fail(429,'Please wait before refreshing.');
   const record=await store.find('share',digest(token));if(!record||record.value.expires<=now()||!await eligible(record.userId))throw Error();
   const j=await readJourney(record.userId,record.value.journeyKey);if(!j)throw Error();const verified=j.details?.mode==='live'&&['MATCHED_RECENT_AIRCRAFT','MATCHED_DATED_FLIGHT'].includes(j.details?.status),f=verified?j.details.flight:null;
   status=200;content=`<p>Skyward · Shared flight</p><h1>${escape(j.callsign)}</h1><h2>${escape(j.from||'Unknown origin')} → ${escape(j.to||'Unknown destination')}</h2><p>${escape(j.date)} · ${escape(f?.status||'Flight status not verified')}</p><p>${f?'Last verified check: '+escape(new Date(j.details.fetchedAt).toISOString()):'This is a saved journey, not a confirmed live flight update.'}</p>${f?`<p>Departure gate: ${escape(f.departure?.gate||'Not supplied')} · Arrival gate: ${escape(f.arrival?.gate||'Not supplied')}</p>`:''}<p>Link expires ${escape(new Date(record.value.expires).toISOString())}</p><a href="/">Explore Skyward</a>`;
  }catch(e){if(e.status){status=e.status;content=`<h1>${escape(e.message)}</h1>`;}}
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shared flight · Skyward</title><style>body{background:#09141c;color:#edf4f6;font:18px/1.6 system-ui;max-width:680px;margin:10vh auto;padding:24px}a{color:#b4f3dc}h1{font-size:48px}</style><main>${content}</main></html>`);return true;
 }
 // Called only after the existing server-side verified identity/change pipeline.
 async function notifyVerified(userId,eventId,message){
  if(!vapid)return;await store.put(userId,'push-outbox',digest(String(eventId)),{message:String(message).slice(0,300),attempts:0,nextAt:now()},100);
 }
 let running=false;
 async function tick(){if(running)return;running=true;try{
  await travelers.tick();
  await extras.tick();
  for(const r of await store.scan('monitor')){
   if(r.value.nextAt>now()||!r.value.enabled)continue;
   if(!await store.claim(`monitor:${r.userId}`,now(),60000))continue;
   if(r.value.endsAt<now()){await store.drop(r.userId,'monitor',r.key);continue;}
   const u=await eligible(r.userId);if(!u){await store.drop(r.userId,'monitor',r.key);continue;}
   const budget=await store.get(r.userId,'monitor-budget',month())??{used:0};
   let message;
   if(budget.used>=monthlyLimit)message='Monthly background allowance reached. Manual checks have their own remaining shared allowance.';
   else{await store.put(r.userId,'monitor-budget',month(),{used:budget.used+1},120);try{const result=await lookup(u,r.key);message=result.mode==='demo'?'Synthetic test check complete. No real flight status or alert was generated.':'Check complete.';}catch(e){message=e.status?e.message:'Check unavailable. Will retry later.';}}
   // A pause/remove made during an in-flight check must not be undone.
   if(await store.get(r.userId,'monitor',r.key))await store.put(r.userId,'monitor',r.key,{...r.value,nextAt:now()+15*60000,lastChecked:now(),message},10);
  }
  if(vapid)for(const r of await store.scan('push-outbox')){
   if(r.value.nextAt>now()||!await store.claim(`push:${r.userId}:${r.key}`,now(),60000))continue;
   if(!await eligible(r.userId)){await store.drop(r.userId,'push-outbox',r.key);continue;}
   let retry=false;for(const device of await store.list(r.userId,'push'))try{await sendPush(validSubscription(device.value.subscription),JSON.stringify({title:'Skyward flight update',body:r.value.message,tag:r.key,url:'/?account=return'}),{vapidDetails:vapid,TTL:3600,timeout:10000});}catch(e){if([404,410].includes(e.statusCode))await store.drop(r.userId,'push',device.key);else retry=true;}
   if(retry&&r.value.attempts<3)await store.put(r.userId,'push-outbox',r.key,{...r.value,attempts:r.value.attempts+1,nextAt:now()+300000},100);else await store.drop(r.userId,'push-outbox',r.key);
  }
 }finally{running=false;}}
 return {handle,publicHandle,notifyVerified,tick};
}
