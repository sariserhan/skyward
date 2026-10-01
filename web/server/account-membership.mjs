import {airlineNames} from '../src/lib/airlineNames.ts';
import {billingConfigured,subscriptionSummary} from './billing-status.mjs';
import {createStripeWebhook} from './stripe-webhook.mjs';
import {embeddedCheckout,existingSubscription,stripePrices,configuredPrices,selectedPrice,checkoutPlans,checkoutStatus} from './stripe-checkout.mjs';
import {createPremiumLive} from './premium-live.mjs';
import {isDeepStrictEqual} from 'node:util';
import {librarySummary} from './simulator-replay.mjs';
import {developmentPremium} from './development-premium.mjs';
import {postgresPremiumStore} from './premium-store.mjs';
import {createPremiumTools} from './premium-tools.mjs';
import {toNodeHandler,fromNodeHeaders} from 'better-auth/node';
import {createHash} from 'node:crypto';
import {LIBRARY_LIMITS,ACCOUNT_LIBRARY_BYTES,validateLibrary} from './account-library.mjs';
import {changesSince} from './flight-alerts.mjs';
import {airlabsPreview,flightCode} from './airlabs.mjs';
import airports from '../data/airport-catalog.json' with {type:'json'};
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const customerId=v=>typeof v==='string'?v:v?.id;
const integer=(v,fallback)=>{const n=Number(v??fallback);if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid premium limit');return n;};

export function createAccountMembership({env=process.env,pool,auth,origin,transact,throttleRequest,fetchImpl=fetch,now=Date.now,observations=()=>[],airlabsPermissions}={}) {
 const devPremium=developmentPremium(env);
 const authHandler=toNodeHandler(auth);
 const rows=async(sql,args=[],db=pool)=>(await db.query(sql,args)).rows;
 const one=async(sql,args=[],db=pool)=>(await rows(sql,args,db))[0];
 async function transaction(lock,action){if(transact)return transact(lock,action);const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);const result=await action(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async function user(req){const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});if(!session?.user?.emailVerified)return null;const profile=await one('SELECT stripe_customer FROM skyward_profiles WHERE user_id=$1',[session.user.id]);return {...session.user,customer:profile?.stripe_customer};}
 const liveBilling=env.SKYWARD_BILLING_MODE==='live';
 const key=env.STRIPE_SECRET_KEY||'',price=stripePrices(env).annual,billing=key.startsWith(liveBilling?'sk_live_':'sk_test_')&&/^price_[A-Za-z0-9]+$/.test(price);
 const limits={userRequests:integer(env.SKYWARD_MONTHLY_LOOKUPS,100),globalRequests:integer(env.SKYWARD_GLOBAL_LOOKUPS,1000),budgetMicros:integer(env.SKYWARD_BUDGET_MICROS,1000000),requestMicros:integer(env.SKYWARD_REQUEST_MICROS,1000)};
 async function stripe(path,params,idem){
  if(!billing)fail(503,'Checkout is not configured yet.');
  try{const response=await fetchImpl(`https://api.stripe.com/v1/${path}`,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-08-26.dahlia',...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idem?{'Idempotency-Key':idem}:{})},body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw Error();return await response.json();}catch{fail(503,'Subscription service is unavailable. No premium access was granted.');}
 }
 async function paidEntitlement(u){if(!billing||!u.customer)return false;const q=new URLSearchParams({customer:u.customer,status:'active',limit:'100','expand[]':'data.latest_invoice'}),s=await stripe(`subscriptions?${q}`);return (s.data||[]).some(v=>v.livemode===liveBilling&&v.status==='active'&&customerId(v.customer)===u.customer&&v.latest_invoice?.status==='paid'&&v.latest_invoice.amount_paid>0&&customerId(v.latest_invoice.customer)===u.customer&&v.items?.data?.some(i=>configuredPrices(env).includes(i.price?.id)&&i.current_period_end*1000>now()));}
 async function entitlement(u){return !!(devPremium&&u)||await paidEntitlement(u);}
 async function usage(u){const month=new Date(now()).toISOString().slice(0,7),r=await one('SELECT requests,cost FROM skyward_usage WHERE user_id=$1 AND month=$2',[u.id,month]);return {requests:r?.requests??0,cost:Number(r?.cost??0),limit:limits.userRequests,month,mode:liveBilling?'live':'test',remaining:Math.max(0,limits.userRequests-(r?.requests??0)),resetAt:Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1),actualProviderSpend:liveBilling?null:0};}
 async function throttle(req){if(throttleRequest)return throttleRequest(req);const expiry=(Math.floor(now()/60000)+1)*60000,k=createHash('sha256').update(`${req.socket.remoteAddress}:${expiry}`).digest('hex');const r=await one('INSERT INTO skyward_rate_limits VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=skyward_rate_limits.count+1 RETURNING count',[k,expiry]);await pool.query('DELETE FROM skyward_rate_limits WHERE expires<$1',[now()]);if(r.count>120)fail(429,'Too many attempts. Please try again shortly.');}
 async function body(req,path){const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>(path==='/api/account/library'?64*1024:8192))fail(413,'Request too large.');chunks.push(c);}try{const b=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{fail(400,'Invalid request.');}}
 async function library(path,method,u,url,b){
  if(path==='/api/account/alerts'&&method==='POST'){
   if(!Number.isSafeInteger(b.throughId)||b.throughId<0)fail(400,'Invalid alert cursor.');
   await pool.query('INSERT INTO skyward_alert_reads VALUES($1,LEAST($2,(SELECT COALESCE(MAX(id),0) FROM skyward_alerts WHERE user_id=$1))) ON CONFLICT(user_id) DO UPDATE SET through_id=GREATEST(skyward_alert_reads.through_id,excluded.through_id)',[u.id,b.throughId]);return {ok:true};
  }
  if(path==='/api/account/dashboard'&&method==='GET'){
   const read=(await one('SELECT through_id FROM skyward_alert_reads WHERE user_id=$1',[u.id]))?.through_id??0;
   return {journeys:(await rows('SELECT j.body,c.body AS detail FROM skyward_journeys j LEFT JOIN skyward_checks c ON c.user_id=j.user_id AND c.key=j.key WHERE j.user_id=$1 ORDER BY j.key',[u.id])).map(r=>({...r.body,details:r.detail??null})),alerts:(await rows('SELECT id,message,created FROM skyward_alerts WHERE user_id=$1 ORDER BY id DESC LIMIT 50',[u.id])).map(a=>({...a,created:Number(a.created),read:a.id<=read})),counts:await rows('SELECT kind,COUNT(*)::integer count FROM skyward_library WHERE user_id=$1 GROUP BY kind',[u.id])};
  }
  if(path!=='/api/account/library')return null;
  const kind=method==='GET'?url.searchParams.get('kind'):b.kind,limit=Object.hasOwn(LIBRARY_LIMITS,kind)?LIBRARY_LIMITS[kind]:null;
  if(!limit)fail(400,'Unknown library.');if((!limit.free||(method==='POST'&&b.remove!==true))&&!await entitlement(u))fail(403,'Premium is required to save and sync account data.');
  if(method==='GET'){
   const key=url.searchParams.get('key');if(key){const r=await one('SELECT key,body,revision,updated FROM skyward_library WHERE user_id=$1 AND kind=$2 AND key=$3',[u.id,kind,key]);if(!r)fail(404,'Saved item not found.');return {key:r.key,value:r.body,revision:r.revision,updated:Number(r.updated)};}
   return {items:(await rows('SELECT key,body,revision,updated FROM skyward_library WHERE user_id=$1 AND kind=$2 ORDER BY updated DESC',[u.id,kind])).map(r=>({key:r.key,revision:r.revision,updated:Number(r.updated),value:kind==='recordings'||(kind==='simulator'&&r.body.kind==='career')?undefined:librarySummary(kind,r.body),name:r.body.name??r.body.airport_name??r.body.career?.airport_name??r.body.callsign??kind,bytes:Buffer.byteLength(JSON.stringify(r.body))})),limits:limit};
  }
  const key=typeof b.key==='string'?b.key.trim():'';if(!key||key.length>120||!/^[a-zA-Z0-9._:-]+$/.test(key))fail(400,'Invalid item key.');
  return transaction(`library:${u.id}`,async db=>{
   const old=await one('SELECT revision,body,octet_length(body::text) AS bytes FROM skyward_library WHERE user_id=$1 AND kind=$2 AND key=$3',[u.id,kind,key],db);
   if((!limit.free||kind==='boardingpasses')&&b.revision!==(old?.revision??0))fail(409,'This item changed on another device. Refresh before saving.');
   if(b.remove===true){await db.query('DELETE FROM skyward_library WHERE user_id=$1 AND kind=$2 AND key=$3',[u.id,kind,key]);return {ok:true};}
   const value=validateLibrary(kind,b.value),encoded=JSON.stringify(value);if(kind==='boardingpasses'&&value.journeyKey){const saved=await one('SELECT body FROM skyward_journeys WHERE user_id=$1 AND key=$2',[u.id,value.journeyKey],db),j=saved?.body;if(!j||j.date!==value.date||j.from&&j.from!==value.from||j.to&&j.to!==value.to||j.callsign!==value.callsign)fail(400,'Link a matching journey from your own account.');}if(kind==='aircraftfollows'&&key!=='airframes')fail(400,'Use the canonical airframes list.');if(kind==='watchlist'&&key!==value.hex)fail(400,'Watch key must match its aircraft.');if(Buffer.byteLength(encoded)>limit.bytes)fail(413,'Saved item exceeds its storage limit.');
   if(!old&&Number((await one('SELECT COUNT(*) n FROM skyward_library WHERE user_id=$1 AND kind=$2',[u.id,kind],db)).n)>=limit.count)fail(429,'Library is full. Remove an item before adding another.');
   const oldBytes=old?Number(old.bytes):0;
   if(old&&isDeepStrictEqual(old.body,value))return {ok:true,key,revision:old.revision,unchanged:true};
   const totals=await one('SELECT COALESCE(SUM(octet_length(body::text)),0) bytes,octet_length($2::jsonb::text) incoming FROM skyward_library WHERE user_id=$1',[u.id,encoded],db),used=Number(totals.bytes),incoming=Number(totals.incoming);
   if(used-oldBytes+incoming>ACCOUNT_LIBRARY_BYTES&&(!old||incoming>oldBytes))fail(413,'Account storage is full (512 KB). Remove saved items or export a local backup.');
   const revision=(old?.revision??0)+1;await db.query('INSERT INTO skyward_library VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,kind,key) DO UPDATE SET body=excluded.body,revision=excluded.revision,updated=excluded.updated',[u.id,kind,key,encoded,revision,now()]);return {ok:true,key,revision};
  });
 }
 async function reserveLive(u){return transaction('skyward:lookup-budget',async db=>{
 const month=new Date(now()).toISOString().slice(0,7),own=await one('SELECT requests FROM skyward_usage WHERE user_id=$1 AND month=$2',[u.id,month],db),total=await one('SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(cost),0) cost FROM skyward_usage WHERE month=$1',[month],db);
 if((own?.requests??0)>=limits.userRequests||Number(total.requests)>=limits.globalRequests||Number(total.cost)+limits.requestMicros>limits.budgetMicros)fail(429,'Flight-detail allowance reached. No lookup was made.');
 await db.query('INSERT INTO skyward_usage VALUES($1,$2,1,$3) ON CONFLICT(user_id,month) DO UPDATE SET requests=skyward_usage.requests+1,cost=skyward_usage.cost+excluded.cost',[u.id,month,limits.requestMicros]);
 });}
 const live=createPremiumLive({env,paid:async u=>liveBilling&&await paidEntitlement(u),reserve:reserveLive,fetchImpl,now,permissions:airlabsPermissions});
 async function lookup(u,journeyKey){
    if(!await entitlement(u))fail(403,'An active paid subscription is required.');
    if(env.SKYWARD_AIRLABS_MODE==='live'){const row=await one('SELECT body FROM skyward_journeys WHERE user_id=$1 AND key=$2',[u.id,String(journeyKey||'')]);if(!row)fail(404,'Save this journey first.');const result=await live.flight(u,row.body);await recordVerifiedCheck(u.id,row.body.key,result);return {...result,usage:await usage(u)};}
    const result=await transaction('skyward:lookup-budget',async db=>{
     const j=await one('SELECT body FROM skyward_journeys WHERE user_id=$1 AND key=$2 FOR UPDATE',[u.id,String(journeyKey||'')],db);if(!j)fail(404,'Save this journey before checking details.');const saved=j.body,prev=await one('SELECT checked FROM skyward_checks WHERE user_id=$1 AND key=$2',[u.id,saved.key],db);if(prev&&now()-Number(prev.checked)<60000)fail(429,'Wait a minute before checking this journey again.');
     const month=new Date(now()).toISOString().slice(0,7),own=await one('SELECT requests FROM skyward_usage WHERE user_id=$1 AND month=$2',[u.id,month],db),total=await one('SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(cost),0) cost FROM skyward_usage WHERE month=$1',[month],db);
     if((own?.requests??0)>=limits.userRequests||Number(total.requests)>=limits.globalRequests||Number(total.cost)+limits.requestMicros>limits.budgetMicros)fail(429,'Flight-detail allowance reached. No lookup was made.');
     await db.query('INSERT INTO skyward_usage VALUES($1,$2,1,$3) ON CONFLICT(user_id,month) DO UPDATE SET requests=skyward_usage.requests+1,cost=skyward_usage.cost+excluded.cost',[u.id,month,limits.requestMicros]);
     const result={...airlabsPreview('demo'),requestedJourney:saved,checkedAt:now(),message:'Synthetic example DEMO101. Not live data for your saved journey.'};await db.query('INSERT INTO skyward_checks VALUES($1,$2,$3,$4) ON CONFLICT(user_id,key) DO UPDATE SET body=excluded.body,checked=excluded.checked',[u.id,saved.key,JSON.stringify(result),now()]);return result;
    });return {...result,usage:await usage(u)};
 }
 const premium=createPremiumTools({store:postgresPremiumStore(pool,transaction),observations,listJourneys:async id=>(await rows('SELECT j.body,c.body AS detail FROM skyward_journeys j LEFT JOIN skyward_checks c ON j.user_id=c.user_id AND j.key=c.key WHERE j.user_id=$1',[id])).map(r=>({...r.body,details:r.detail})),entitlement,env,now,userById:async id=>{const u=await one('SELECT id,email FROM "user" WHERE id=$1 AND "emailVerified"=true',[id]);if(!u)return null;return {...u,customer:(await one('SELECT stripe_customer FROM skyward_profiles WHERE user_id=$1',[id]))?.stripe_customer};},readJourney:async(id,key)=>{const r=await one('SELECT j.body,c.body AS detail FROM skyward_journeys j LEFT JOIN skyward_checks c ON j.user_id=c.user_id AND j.key=c.key WHERE j.user_id=$1 AND j.key=$2',[id,key]);return r?{...r.body,details:r.detail}:null;},lookup});
 const billingWebhook=createStripeWebhook({env,store:postgresPremiumStore(pool,transaction),findUser:async customer=>{const row=await one('SELECT user_id FROM skyward_profiles WHERE stripe_customer=$1',[customer]);return row?{id:row.user_id}:null;},entitlement:paidEntitlement,live:liveBilling,now});
 async function handle(req,res,url){
  if(await premium.publicHandle(req,res,url))return true;
  if(url.pathname.startsWith('/api/auth/')){res.setHeader('Cache-Control','no-store');req.headers['x-skyward-client-ip']=req.socket.remoteAddress||'127.0.0.1';await authHandler(req,res);return true;}
  if(!/^\/api\/(account(?:\/|$)|billing(?:\/|$)|journeys(?:\/|$)|premium(?:\/|$))/.test(url.pathname))return false;
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   if(url.pathname==='/api/billing/webhook'){send(200,await billingWebhook(req));return true;}
   if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.');
   if(req.method==='POST'&&(req.headers.origin!==origin||!String(req.headers['content-type']||'').startsWith('application/json')))fail(403,'Use the account controls on this site.');
   await throttle(req);const u=await user(req),path=url.pathname;
   if(path==='/api/account'&&req.method==='GET'){
    let subscription=null;
    if(u){subscription=subscriptionSummary([],env,u.customer,now());if(billing&&u.customer){try{const result=await stripe('subscriptions?'+new URLSearchParams({customer:u.customer,status:'all',limit:'100','expand[]':'data.latest_invoice'}));subscription=subscriptionSummary(result.data,env,u.customer,now());}catch{subscription={status:'unavailable',premium:false,periodEndsAt:null,cancelAtPeriodEnd:false,canManage:true};}}}
    send(200,{enabled:true,authProvider:'better-auth',billingReady:billingConfigured(env),liveDetailsReady:live.enabled,mode:liveBilling?'live':'test',subscription,user:u?{email:u.email,premium:!!devPremium||!!subscription?.premium}:null,usage:u?await usage(u):null});return true;
   }
   if(!u)fail(401,'Sign in with a verified email to continue.');
   const b=req.method==='POST'?await body(req,path):{};const extra=await premium.handle(path,req.method,u,b);if(extra){send(200,extra);return true;}const result=await library(path,req.method,u,url,b);if(result){send(200,result);return true;}
   if(path==='/api/billing/plans'&&req.method==='GET'){send(200,{...await checkoutPlans(env,stripe,liveBilling),monthlyLookups:limits.userRequests});return true;}
   if(path==='/api/billing/session'&&req.method==='GET'){send(200,await checkoutStatus(url.searchParams.get('session_id'),u,stripe,entitlement,liveBilling));return true;}
   if(path==='/api/billing/checkout'&&req.method==='POST'){
    if(liveBilling&&!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))fail(503,'Live billing notifications must be configured first.');
    const plan=b.plan??'annual',chosenPrice=selectedPrice(env,plan),embedded=b.uiMode==='embedded';if(b.uiMode!==undefined&&!embedded)fail(400,'Invalid checkout mode.');await checkoutPlans(env,stripe,liveBilling);
    if(await entitlement(u))fail(409,'Premium is already active. Use Manage subscription.');
    if(!u.customer){const c=await stripe('customers',{email:u.email,'metadata[skyward_user]':u.id},`skyward-${liveBilling?'live':'test'}-customer-${u.id}`);if(c.livemode!==liveBilling||!/^cus_/.test(c.id))fail(503,'Invalid checkout configuration.');await pool.query('INSERT INTO skyward_profiles VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET stripe_customer=excluded.stripe_customer',[u.id,c.id]);u.customer=c.id;}
    await existingSubscription(u,env,stripe);
    if(embedded){send(200,await embeddedCheckout({env,live:liveBilling,user:u,origin,stripe,now}));return true;}
    const c=await stripe('checkout/sessions',{mode:'subscription',customer:u.customer,'line_items[0][price]':chosenPrice,'line_items[0][quantity]':'1',success_url:origin+'/?account=return',cancel_url:origin+'/?account=cancel',client_reference_id:u.id},`skyward-${liveBilling?'live':'test'}-checkout-${u.id}-${Math.floor(now()/1800000)}`);
    if(c.livemode!==liveBilling||!String(c.url).startsWith('https://checkout.stripe.com/'))fail(503,'Invalid checkout configuration.');send(200,{url:c.url});return true;
   }
   if(path==='/api/billing/portal'&&req.method==='POST'){if(!u.customer)fail(409,'No subscription account exists yet.');const p=await stripe('billing_portal/sessions',{customer:u.customer,return_url:origin+'/?account=return'});if(!String(p.url).startsWith('https://billing.stripe.com/'))fail(503,'Subscription management is unavailable.');send(200,{url:p.url});return true;}
   if(path==='/api/journeys'&&req.method==='GET'){send(200,{journeys:(await rows('SELECT body FROM skyward_journeys WHERE user_id=$1 ORDER BY key DESC',[u.id])).map(r=>r.body),alerts:(await rows('SELECT id,message,created FROM skyward_alerts WHERE user_id=$1 ORDER BY id DESC LIMIT 50',[u.id])).map(a=>({...a,created:Number(a.created)}))});return true;}
   if(path==='/api/journeys'&&req.method==='POST'){
        if(b.remove!==true&&!await entitlement(u))fail(403,'Premium is required to save journeys.');
    const callsign=flightCode(b.callsign),hex=String(b.hex||'').toLowerCase(),date=String(b.date||'');if(hex&&!/^[a-f0-9]{6}$/.test(hex)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail(400,'Choose a valid flight and date.');
    const k=`${callsign}:${hex||'unassigned'}:${date}`,metadata={};for(const side of ['from','to']){const v=typeof b[side]==='string'?b[side].trim().toUpperCase():'';if(v&&!Object.hasOwn(airports,v))fail(400,'Choose an airport from the directory.');if(v)metadata[side]=v;}
    await transaction(`journeys:${u.id}`,async db=>{if(b.remove===true){await db.query('DELETE FROM skyward_journeys WHERE user_id=$1 AND key=$2',[u.id,k]);return;}const old=await one('SELECT key FROM skyward_journeys WHERE user_id=$1 AND key=$2',[u.id,k],db);if(!old&&Number((await one('SELECT COUNT(*) n FROM skyward_journeys WHERE user_id=$1',[u.id],db)).n)>=50)fail(429,'Keep up to 50 saved journeys.');await db.query('INSERT INTO skyward_journeys VALUES($1,$2,$3) ON CONFLICT(user_id,key) DO UPDATE SET body=excluded.body',[u.id,k,JSON.stringify({key:k,callsign,hex,date,...metadata,alerts:b.alerts===true})]);});send(200,{ok:true});return true;
   }
   if(path==='/api/premium/airline-schedules'&&req.method==='POST'){const airline=String(b.airline||'').trim().toUpperCase();if(!Object.hasOwn(airlineNames,airline))fail(400,'Choose a supported airline.');send(200,await live.airlineSchedules(u,airline));return true;}
   if(path==='/api/premium/schedules'&&req.method==='POST'){const airport=String(b.airport||'').toUpperCase();if(!Object.hasOwn(airports,airport)||!['departures','arrivals'].includes(b.direction))fail(400,'Choose an airport and board direction.');send(200,await live.schedules(u,airport,b.direction));return true;}
   if(path==='/api/premium/details'&&req.method==='POST'){send(200,await lookup(u,b.key));return true;}
   fail(404,'Endpoint not found.');
  }catch(e){send(e.status||500,{error:e.status?e.message:'Unable to complete this request.'});}
  return true;
 }
 async function recordVerifiedCheck(userId,journeyKey,result){
  if(result.mode!=='live'||!['MATCHED_RECENT_AIRCRAFT','MATCHED_DATED_FLIGHT'].includes(result.status)||!Number.isFinite(result.fetchedAt))return;
  const notifications=[];
  await transaction(`check:${userId}:${journeyKey}`,async db=>{
   const j=await one('SELECT body FROM skyward_journeys WHERE user_id=$1 AND key=$2 FOR UPDATE',[userId,journeyKey],db),saved=j?.body,f=result.flight;
   if(!saved||!f||f.callsign!==saved.callsign||(saved.hex&&f.hex!==saved.hex)||!Number.isFinite((typeof f.departure?.scheduledAt==='number'?f.departure.scheduledAt:Date.parse(f.departure?.scheduledAt)))||new Date(f.departure.scheduledAt).toISOString().slice(0,10)!==saved.date)return;
   const prior=(await one('SELECT body FROM skyward_checks WHERE user_id=$1 AND key=$2',[userId,journeyKey],db))?.body;
   if(prior?.mode==='live'&&result.fetchedAt<=prior.fetchedAt)return;
   if(saved.alerts&&prior?.mode==='live')for(const message of changesSince(prior.flight,f)){await db.query('INSERT INTO skyward_alerts(user_id,message,created) VALUES($1,$2,$3)',[userId,`${saved.callsign}: ${message}`,now()]);notifications.push(`${saved.callsign}: ${message}`);}
   await db.query('INSERT INTO skyward_checks VALUES($1,$2,$3,$4) ON CONFLICT(user_id,key) DO UPDATE SET body=excluded.body,checked=excluded.checked',[userId,journeyKey,JSON.stringify(result),now()]);await db.query('DELETE FROM skyward_alerts WHERE user_id=$1 AND id NOT IN (SELECT id FROM skyward_alerts WHERE user_id=$1 ORDER BY id DESC LIMIT 50)',[userId]);
  });
  for(const message of notifications)await premium.notifyVerified(userId,`${journeyKey}:${result.fetchedAt}:${message}`,message);
 }
 async function simulatorAccess(req){try{const u=await user(req);return !u?{allowed:false,status:401}:await entitlement(u)?{allowed:true,status:200}:{allowed:false,status:403};}catch{return {allowed:false,status:503};}}
 return {handle,auth,pool,premiumTick:premium.tick,close:()=>pool.end(),recordVerifiedCheck,simulatorAccess};
}
