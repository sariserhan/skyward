import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMembership,changesSince} from './membership.mjs';
const NOW=1790593200000;
async function fixture(options={}) {
  let paid=false,down=false;const requests=[];
  const env={SKYWARD_ACCOUNTS:'test',SKYWARD_PUBLIC_ORIGIN:'https://skyward.test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_example',...options.env};
  const membership=createMembership({env,dbPath:options.dbPath||':memory:',now:()=>NOW,...options.clock,fetchImpl:async(url,request)=>{
    requests.push({url,request});assert.ok(url.startsWith('https://api.stripe.com/'));if(down)throw Error('secret-provider-error');
    let data={};
    if(url.endsWith('/customers'))data={id:'cus_test',livemode:false};
    else if(url.includes('/subscriptions?'))data={data:paid?[{customer:'cus_test',livemode:false,status:'active',latest_invoice:{status:'paid',amount_paid:900,customer:'cus_test'},items:{data:[{price:{id:'price_example'},current_period_end:NOW/1000+86400}]},...options.subscription}]:[]};
    else if(url.endsWith('/checkout/sessions'))data={url:'https://checkout.stripe.com/c/pay/cs_test_fixture',livemode:false};
    else if(url.endsWith('/billing_portal/sessions'))data={url:'https://billing.stripe.com/p/session/test_fixture'};
    return {ok:true,json:async()=>data};
  }});
  const server=http.createServer((req,res)=>void membership.handle(req,res,new URL(req.url,'http://localhost')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  async function call(path,body,cookie='',headers={}) {
    const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{Origin:'https://skyward.test','Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {code:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
  }
  async function register(email='one@example.test') {const r=await call('/api/account/register',{email,password:'correct horse battery staple'});assert.equal(r.code,200,JSON.stringify(r.body));return r.cookie;}
  return {membership,call,register,requests,paid:v=>{paid=v;},down:v=>{down=v;},close:async()=>{await new Promise(resolve=>server.close(resolve));membership.close();}};
}
const journey={callsign:'AAL6',hex:'aab812',date:'2026-09-28',alerts:true};
const journeyKey='AAL6:aab812:2026-09-28';
test('Accounts hash passwords, rotate/revoke sessions and reject cross-origin writes',async()=>{
  const f=await fixture();try{
    const cookie=await f.register();
    const row=f.membership.db.prepare('SELECT * FROM users').get();assert.ok(!row.password.includes('correct horse'));assert.equal(row.customer,null);
    assert.equal((await f.call('/api/account',undefined,cookie)).body.user.premium,false);
    assert.equal((await f.call('/api/journeys',journey,cookie,{Origin:'https://evil.test'})).code,403);
    const login=await f.call('/api/account/login',{email:'one@example.test',password:'correct horse battery staple'},cookie);
    assert.equal(login.code,200);assert.notEqual(login.cookie,cookie);assert.equal((await f.call('/api/account',undefined,cookie)).body.user,null);
    assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/Secure/);
    await f.call('/api/account/logout',{},login.cookie);assert.equal((await f.call('/api/account',undefined,login.cookie)).body.user,null);
  }finally{await f.close();}
});
test('Free and forged-paid requests cannot trigger premium data, checkout returns do not grant access',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call('/api/premium/details',{key:journeyKey},'premium=true')).code,401);
    const cookie=await f.register();assert.equal((await f.call('/api/journeys',journey,cookie)).code,403);
    assert.equal((await f.call('/api/premium/details',{key:journeyKey,paid:true},cookie)).code,403);assert.equal(f.requests.length,0);
    const checkout=await f.call('/api/billing/checkout',{},cookie);assert.equal(checkout.code,200);
    assert.equal((await f.call('/api/account?account=return',undefined,cookie)).body.user.premium,false);
    assert.equal((await f.call('/api/premium/details',{key:journeyKey},cookie)).code,403);
    f.paid(true);assert.equal((await f.call('/api/journeys',journey,cookie)).code,200);const details=await f.call('/api/premium/details',{key:journeyKey},cookie);assert.equal(details.code,200);assert.equal(details.body.mode,'demo');assert.equal(details.body.flight.callsign,'DEMO101');assert.equal(details.body.usage.requests,1);
    f.paid(false);assert.equal((await f.call('/api/premium/details',{key:journeyKey},cookie)).code,403);
    f.down(true);assert.equal((await f.call('/api/premium/details',{key:journeyKey},cookie)).code,503);
    assert.ok(f.requests.every(r=>!r.url.includes('airlabs')));
  }finally{await f.close();}
});
test('Durable quota reservations stop spending across restart; test activity spends zero real dollars',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'skyward-quota-')),dbPath=join(dir,'account.sqlite');let f;
  try{
    f=await fixture({dbPath,env:{SKYWARD_MONTHLY_LOOKUPS:'1'}});const cookie=await f.register();await f.call('/api/billing/checkout',{},cookie);f.paid(true);await f.call('/api/journeys',journey,cookie);
    assert.equal((await f.call('/api/premium/details',{key:journeyKey},cookie)).code,200);
    await f.close();f=await fixture({dbPath,env:{SKYWARD_MONTHLY_LOOKUPS:'1'}});f.paid(true);
    await f.call('/api/journeys',{...journey,callsign:'AAL7'},cookie);
    assert.equal((await f.call('/api/premium/details',{key:'AAL7:aab812:2026-09-28'},cookie)).code,429);
    const a=(await f.call('/api/account',undefined,cookie)).body;assert.equal(a.usage.requests,1);assert.equal(a.usage.actualProviderSpend,0);
  }finally{if(f)await f.close();rmSync(dir,{recursive:true,force:true});}
});
test('Global cap and concurrent requests cannot overrun allowance',async()=>{
  const f=await fixture({env:{SKYWARD_GLOBAL_LOOKUPS:'1'}});try{
    const cookie=await f.register();await f.call('/api/billing/checkout',{},cookie);f.paid(true);
    await f.call('/api/journeys',journey,cookie);await f.call('/api/journeys',{...journey,callsign:'AAL7'},cookie);
    const results=await Promise.all([f.call('/api/premium/details',{key:journeyKey},cookie),f.call('/api/premium/details',{key:'AAL7:aab812:2026-09-28'},cookie)]);
    assert.deepEqual(results.map(r=>r.code).sort(),[200,429]);
    assert.equal((await f.call('/api/premium/details',{key:'AAL7:aab812:2026-09-28'},cookie)).code,429);
  }finally{await f.close();}
});
test('Budget stops requests before the configured cost ceiling',async()=>{
  const f=await fixture({env:{SKYWARD_BUDGET_MICROS:'999',SKYWARD_REQUEST_MICROS:'1000'}});try{
    const cookie=await f.register();await f.call('/api/billing/checkout',{},cookie);f.paid(true);await f.call('/api/journeys',journey,cookie);
    assert.equal((await f.call('/api/premium/details',{key:journeyKey},cookie)).code,429);
    assert.equal((await f.call('/api/account',undefined,cookie)).body.usage.requests,0);
  }finally{await f.close();}
});
test('Saved journeys are isolated by account and alerts ignore wrong flights, stale checks and simulations',async()=>{
  const f=await fixture();try{
    const a=await f.register(),b=await f.register('two@example.test');await f.call('/api/billing/checkout',{},a);f.paid(true);await f.call('/api/journeys',journey,a);
    assert.equal((await f.call('/api/journeys',undefined,b)).body.journeys.length,0);
    const user=f.membership.db.prepare('SELECT id FROM users WHERE email=?').get('one@example.test');
    const first={mode:'live',status:'MATCHED_RECENT_AIRCRAFT',fetchedAt:NOW,flight:{callsign:'AAL6',hex:'aab812',status:'scheduled',departure:{scheduledAt:Date.parse('2026-09-28T10:00:00Z'),gate:'A2'},arrival:{estimatedAt:NOW,gate:'B1'}}};
    f.membership.recordVerifiedCheck(user.id,journeyKey,first);
    const next={...first,fetchedAt:NOW+1000,flight:{...first.flight,status:'en-route',departure:{...first.flight.departure,gate:'A8'},arrival:{estimatedAt:NOW+900000,gate:'B1'}}};
    f.membership.recordVerifiedCheck(user.id,journeyKey,{...next,mode:'demo'});
    assert.equal((await f.call('/api/journeys',undefined,a)).body.alerts.length,0);
    f.membership.recordVerifiedCheck(user.id,journeyKey,next);
    f.membership.recordVerifiedCheck(user.id,journeyKey,next);
    f.membership.recordVerifiedCheck(user.id,journeyKey,first);
    assert.equal((await f.call('/api/journeys',undefined,a)).body.alerts.length,3);
    assert.equal((await f.call('/api/journeys',undefined,b)).body.alerts.length,0);
    assert.deepEqual(changesSince(next.flight,{...next.flight,status:'landed'}),['Arrival reported']);
  }finally{await f.close();}
});
test('Live payment keys cannot activate this test integration',async()=>{
  const f=await fixture({env:{STRIPE_SECRET_KEY:'sk_live_rejected'}});try{
    const cookie=await f.register();assert.equal((await f.call('/api/account',undefined,cookie)).body.billingReady,false);
    assert.equal((await f.call('/api/billing/checkout',{},cookie)).code,503);assert.equal(f.requests.length,0);
  }finally{await f.close();}
});

test('Trials, unpaid invoices, wrong prices, expired periods and live subscriptions grant no entitlement',async()=>{
  for(const subscription of [
    {status:'trialing'},
    {latest_invoice:{status:'open',amount_paid:0,customer:'cus_test'}},
    {latest_invoice:{status:'paid',amount_paid:0,customer:'cus_test'}},
    {items:{data:[{price:{id:'price_other'},current_period_end:NOW/1000+86400}]}},
    {items:{data:[{price:{id:'price_example'},current_period_end:NOW/1000-1}]}},
    {livemode:true},
    {customer:'cus_someone_else'}
  ]) {
    const f=await fixture({subscription});try{
      const cookie=await f.register();await f.call('/api/billing/checkout',{},cookie);f.paid(true);
      assert.equal((await f.call('/api/account',undefined,cookie)).body.user.premium,false);
    }finally{await f.close();}
  }
});

test('Watchlist sync requires Premium, isolates accounts, and permits reading and removal after downgrade',async()=>{
 const f=await fixture();try{
  const a=await f.register(),b=await f.register('second@example.test');
  const watch={hex:'aab812',callsign:'AAL6',registration:'N123',aircraftType:'B738'};
  assert.equal((await f.call('/api/account/library',{kind:'watchlist',key:watch.hex,value:watch,premium:true},a)).code,403);
  await f.call('/api/billing/checkout',{},a);f.paid(true);
  assert.equal((await f.call('/api/account/library',{kind:'watchlist',key:watch.hex,value:watch},a)).code,200);
  assert.equal((await f.call('/api/account/library',{kind:'watchlist',key:'000001',value:watch},a)).code,400);f.paid(false);
  const login=await f.call('/api/account/login',{email:'one@example.test',password:'correct horse battery staple'});
  assert.equal((await f.call('/api/account/library?kind=watchlist',undefined,login.cookie)).body.items[0].value.callsign,'AAL6');
  assert.equal((await f.call('/api/account/library?kind=watchlist',undefined,b)).body.items.length,0);
  for(const kind of ['views','recordings','logbook','simulator']){
   assert.equal((await f.call('/api/account/library?kind='+kind,undefined,a)).code,403);
   assert.equal((await f.call('/api/account/library',{kind,key:'x',revision:0,value:{premium:true}},a)).code,403);
  }
  assert.equal((await f.call('/api/account/library?kind=watchlist')).code,401);
  assert.equal((await f.call('/api/account/library?kind=__proto__',undefined,a)).code,400);
  assert.equal((await f.call('/api/account/library',{kind:'watchlist',key:watch.hex,value:watch},a)).code,403);
  assert.equal((await f.call('/api/account/library',{kind:'watchlist',key:watch.hex,remove:true},a)).code,200);
  assert.equal((await f.call('/api/account/library?kind=watchlist',undefined,a)).body.items.length,0);
 }finally{await f.close();}
});
test('Premium libraries persist, enforce optimistic edits and validate viewing settings and logbooks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'skyward-library-'));let f;try{
  const dbPath=join(dir,'db.sqlite');f=await fixture({dbPath});const cookie=await f.register();await f.call('/api/billing/checkout',{},cookie);f.paid(true);
  const payload={kind:'views',key:'home',revision:0,value:{name:'Home',settings:{'skyward.cabin-audio.v1':'off'}}};
  assert.equal((await f.call('/api/account/library',payload,cookie)).body.revision,1);
  assert.equal((await f.call('/api/account/library',payload,cookie)).code,409);
  assert.equal((await f.call('/api/account/library',{...payload,revision:1,value:{settings:{'skyward_session':'forged'}}},cookie)).code,400);
  assert.equal((await f.call('/api/account/library',{...payload,revision:1,value:{settings:{'skyward.map.v1':'null'}}},cookie)).code,400);
  const log={kind:'logbook',key:'trip',revision:0,value:{date:'2026-09-28',from:'IAD',to:'LHR',durationMinutes:430,callsign:'BA216'}};
  assert.equal((await f.call('/api/account/library',log,cookie)).code,200);
  assert.equal((await f.call('/api/account/library',{...log,key:'bad',value:{...log.value,date:'2026-02-30'}},cookie)).code,400);
  await f.close();f=await fixture({dbPath});f.paid(true);
  assert.equal((await f.call('/api/account/library?kind=views&key=home',undefined,cookie)).body.revision,1);
  assert.equal((await f.call('/api/account/library?kind=logbook',undefined,cookie)).body.items[0].value.to,'LHR');
  assert.equal((await f.call('/api/account/library',{...payload,revision:1,remove:true},cookie)).code,200);
  assert.equal((await f.call('/api/account/library?kind=views&key=home',undefined,cookie)).code,404);
  f.paid(false);assert.equal((await f.call('/api/account/library?kind=logbook',undefined,cookie)).code,403);
 }finally{if(f)await f.close();rmSync(dir,{recursive:true,force:true});}
});
test('New recordings stay local; storage caps prevent unbounded libraries',async()=>{
 const f=await fixture();try{
  const c=await f.register();await f.call('/api/billing/checkout',{},c);f.paid(true);
  const recording={format:'skyward-session',version:1,createdAt:NOW,name:'My flight',tracks:[{identity:{hex:'aab812',callsign:'AAL6'},points:[{lat:38.95,lon:-77.46,altitude:1000,time:NOW,ground:false}]}]};
  assert.equal((await f.call('/api/account/library',{kind:'recordings',key:'one',revision:0,value:recording},c)).code,413);
  const r=await f.call('/api/account/library?kind=recordings&key=one',undefined,c);assert.equal(r.code,404);
  assert.equal((await f.call('/api/account/library',{kind:'recordings',key:'bad',revision:0,value:{...recording,tracks:[{...recording.tracks[0],points:[{lat:1000}]}]}},c)).code,413);
  assert.equal((await f.call('/api/account/library',{kind:'views',key:'large',revision:0,value:{name:'x'.repeat(65536),settings:{}}},c)).code,413);
  for(let i=0;i<10;i++)assert.equal((await f.call('/api/account/library',{kind:'views',key:'view-'+i,revision:0,value:{name:'View',settings:{}}},c)).code,200);
  assert.equal((await f.call('/api/account/library',{kind:'views',key:'overflow',revision:0,value:{settings:{}}},c)).code,429);
  assert.equal((await f.call('/api/account/library',{kind:'simulator',key:'bad',revision:0,value:{kind:'career',version:1}},c)).code,400);
 }finally{await f.close();}
});
test('Dashboard distinguishes sample details from verified statuses; alerts read state stays private',async()=>{
 const f=await fixture();try{
  const a=await f.register(),b=await f.register('other@example.test');await f.call('/api/billing/checkout',{},a);f.paid(true);await f.call('/api/journeys',{...journey,from:'IAD',to:'LHR'},a);
  await f.call('/api/premium/details',{key:journeyKey},a);
  const dashboard=(await f.call('/api/account/dashboard',undefined,a)).body;
  assert.equal(dashboard.journeys[0].from,'IAD');assert.equal(dashboard.journeys[0].details.mode,'demo');assert.equal(dashboard.alerts.length,0);
  const uid=f.membership.db.prepare('SELECT id FROM users WHERE email=?').get('one@example.test').id;
  f.membership.db.prepare('INSERT INTO alerts(user_id,message,created) VALUES(?,?,?)').run(uid,'Verified test event',NOW);
  const alerts=(await f.call('/api/account/dashboard',undefined,a)).body.alerts;assert.equal(alerts[0].read,false);
  await f.call('/api/account/alerts',{throughId:alerts[0].id},b);
  assert.equal((await f.call('/api/account/dashboard',undefined,a)).body.alerts[0].read,false);
  await f.call('/api/account/alerts',{throughId:alerts[0].id},a);
  assert.equal((await f.call('/api/account/dashboard',undefined,a)).body.alerts[0].read,true);
  assert.ok(f.requests.every(r=>r.url.startsWith('https://api.stripe.com/')));
 }finally{await f.close();}
});
test('Verified terminal and cancellation changes produce understandable alerts',()=>{
 assert.deepEqual(changesSince({status:'scheduled',departure:{terminal:'1'}},{status:'cancelled',departure:{terminal:'2'}}),['Flight status: cancelled','Departure terminal changed: 1 → 2']);
});
test('Local Premium testing is opt-in, loopback-only and cannot be granted by HTTP clients',async()=>{
 assert.throws(()=>createMembership({env:{SKYWARD_ACCOUNTS:'test',SKYWARD_LOCAL_PREMIUM:'1',SKYWARD_PUBLIC_ORIGIN:'https://public.example'},dbPath:':memory:'}),/loopback/);
 const f=await fixture({env:{SKYWARD_LOCAL_PREMIUM:'1',SKYWARD_PUBLIC_ORIGIN:'http://localhost:8000',STRIPE_SECRET_KEY:''}});try{
  const r=await f.call('/api/account/register',{email:'local@example.test',password:'correct horse battery staple'},'',{Origin:'http://localhost:8000'});assert.equal(r.code,200);const c=r.cookie;
  assert.equal((await f.call('/api/account',undefined,c)).body.user.premium,false);
  assert.equal((await f.call('/api/account/grant',{premium:true},c,{Origin:'http://localhost:8000'})).code,404);
  const u=f.membership.db.prepare('SELECT id FROM users').get();
  f.membership.db.prepare('INSERT INTO local_test_access VALUES(?,?)').run(u.id,NOW+60000);
  assert.equal((await f.call('/api/account',undefined,c)).body.user.premium,true);
  f.membership.db.prepare('UPDATE local_test_access SET expires=?').run(NOW-1);
  assert.equal((await f.call('/api/account',undefined,c)).body.user.premium,false);assert.equal(f.requests.length,0);
 }finally{await f.close();}
});

test('Development accounts unlock Premium libraries, tools and simulators without billing',async()=>{
 const origin='http://localhost:8000';
 const f=await fixture({env:{NODE_ENV:'development',SKYWARD_DEV_PREMIUM:'1',SKYWARD_PUBLIC_ORIGIN:origin,STRIPE_SECRET_KEY:'',STRIPE_PRICE_ID:''}});
 try{
  const automatic=await f.call('/api/account');assert.equal(automatic.body.user.premium,true);assert.ok(automatic.cookie);
  assert.equal((await f.membership.simulatorAccess({headers:{cookie:automatic.cookie}})).allowed,true);
  const registered=await f.call('/api/account/register',{email:'dev@example.test',password:'correct horse battery staple'},'',{Origin:origin});
  assert.equal(registered.code,200);const cookie=registered.cookie;
  assert.equal((await f.call('/api/account',undefined,cookie)).body.user.premium,true);
  assert.equal((await f.membership.simulatorAccess({headers:{cookie}})).allowed,true);
  for(const kind of ['trips','journal','airports','missions','recordings','simulator']){
   const result=await f.call('/api/account/library?kind='+kind,undefined,cookie);
   assert.equal(result.code,200,JSON.stringify({kind,...result.body}));
  }
  for(const path of ['monitoring','notifications','shares'])assert.equal((await f.call('/api/premium/'+path,undefined,cookie)).code,200);
  await f.call('/api/journeys',journey,cookie,{Origin:origin});
  const detail=await f.call('/api/premium/details',{key:journeyKey},cookie,{Origin:origin});assert.equal(detail.code,200);assert.equal(detail.body.mode,'demo');
  assert.equal(f.requests.length,0,'No billing or paid API requests');
  assert.equal(f.membership.db.prepare('SELECT count(*) AS n FROM local_test_access').get().n,0);
 }finally{await f.close();}
});
