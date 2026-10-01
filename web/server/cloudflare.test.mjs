import {verifiedAirLabs} from './fixtures/airlabs-permissions.mjs';
import {createHmac} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {d1Pool,d1Statement} from '../cloudflare/d1-pool.mjs';import {createD1Auth} from '../cloudflare/auth.mjs';import {createAccountMembership} from './account-membership.mjs';import {nodeHandler} from '../cloudflare/node-handler.mjs';import {handle} from '../cloudflare/router.mjs';import {resendSender} from './resend.mjs';import {publicPage} from './public-pages.mjs';
const origin='https://skyvvard.com';
function localD1(){const db=new DatabaseSync(':memory:');for(const f of ['0001-better-auth.sql','0002-application.sql','0003-auth-retention.sql'])db.exec(readFileSync(new URL('../cloudflare/migrations/'+f,import.meta.url),'utf8'));
 const binding={exec:sql=>db.exec(sql),prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async run(){return this.all();},async all(){const results=db.prepare(sql).all(...this.args);return {results,success:true,meta:{changes:Number(db.prepare('SELECT changes() n').get().n)}};}};},async batch(items){db.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.all());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};return {db,binding};}
test('Resend sends private account mail with a deterministic idempotency key and no error-body leakage',async()=>{
 let sent;const send=resendSender({RESEND_API_KEY:'test-key'},async(url,options)=>{sent={url,options};return {ok:true};});await send({to:'member@example.invalid',subject:'Verify Skyward',text:'private-token'});const body=JSON.parse(sent.options.body);assert.equal(body.from,'Skyward <contact@skyvvard.com>');assert.equal(body.reply_to,'support@skyvvard.com');assert.deepEqual(body.to,['member@example.invalid']);assert.equal(sent.options.headers['Idempotency-Key'].length,64);await assert.rejects(resendSender({RESEND_API_KEY:'test'},async()=>({ok:false}))({to:'a',text:'secret'}),/Account email delivery failed/);
});
test('D1 application transactions are atomic and preserve JSON and repeated parameters',async()=>{
 const {db,binding}=localD1(),{pool,transaction}=d1Pool(binding);try{
 db.prepare('INSERT INTO user VALUES(?,?,?,?,?,?,?)').run('u','Member','u@example.invalid',1,null,'2026-01-01','2026-01-01');
 await transaction('test',async()=>{await pool.query('INSERT INTO skyward_journeys VALUES($1,$2,$3)',['u','key','{"callsign":"THY1"}']);});assert.deepEqual((await pool.query('SELECT body FROM skyward_journeys WHERE user_id=$1',['u'])).rows[0].body,{callsign:'THY1'});
 await assert.rejects(transaction('test',async()=>{await pool.query('DELETE FROM skyward_journeys WHERE user_id=$1',['u']);throw Error('validation');}));assert.equal((await pool.query('SELECT key FROM skyward_journeys')).rows.length,1);
 await assert.rejects(transaction('test',async()=>{await pool.query('DELETE FROM skyward_journeys WHERE user_id=$1',['u']);await pool.query('INSERT INTO skyward_journeys VALUES($1,$2,$3)',['missing-user','k','{}']);}));assert.equal((await pool.query('SELECT key FROM skyward_journeys')).rows.length,1);
 assert.deepEqual(d1Statement('SELECT $2,$1,$2',[1,2]).values,[2,1,2]);assert.equal(d1Statement('SELECT octet_length($1::jsonb::text) incoming',['{}']).sql,'SELECT length(CAST(? AS BLOB)) incoming');
 }finally{db.close();}
});
test('D1 Better Auth verification, ownership, premium gating, reset work together',async()=>{
 const {db,binding}=localD1(),outbox=[],env={DB:binding,SKYWARD_PUBLIC_ORIGIN:origin,BETTER_AUTH_SECRET:'test-only-strong-secret-at-least-32-chars',SKYWARD_ACCOUNTS:'d1',NODE_ENV:'production'},auth=createD1Auth(env,{sendEmail:async m=>outbox.push(m)}),{pool,transaction}=d1Pool(binding),membership=createAccountMembership({env,pool,auth,origin,transact:transaction,throttleRequest:async()=>{}});
 const request=async(path,body,cookie)=>{const r=new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return path.startsWith('/api/auth/')?auth.handler(r):nodeHandler(r,(req,res,url)=>membership.handle(req,res,url));};
 try{const email='member@example.invalid',password='Long-unique-test-password-123';let r=await request('/api/auth/sign-up/email',{email,password,name:'Member'});assert.equal(r.status,200,await r.clone().text());assert.equal(outbox.length,1);assert.equal((await request('/api/auth/sign-in/email',{email,password})).status,403);
 const beforeResend=outbox.length;assert.equal((await request('/api/auth/send-verification-email',{email,callbackURL:origin+'/account/'})).status,200);assert.equal(outbox.length,beforeResend+1);
 const invalid=await request('/api/auth/verify-email?token=invalid&callbackURL='+encodeURIComponent(origin+'/account/'));assert.ok(invalid.status>=400||/error=/.test(invalid.headers.get('location')||''));assert.equal(db.prepare('SELECT emailVerified FROM user WHERE email=?').get(email).emailVerified,0);
 const verification=new URL(outbox[0].text.match(/https:\/\/\S+/)[0]);r=await request(verification.pathname+verification.search);assert.ok([200,302].includes(r.status),await r.clone().text());
 r=await request('/api/auth/sign-in/email',{email,password});assert.equal(r.status,200,await r.clone().text());const cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookie);assert.equal((await (await request('/api/account',null,cookie)).json()).user.email,email);
 assert.equal((await request('/api/account/library',{kind:'watchlist',key:'abcdef',value:{hex:'abcdef'}},cookie)).status,403);assert.equal((await request('/api/premium/details',{key:'missing'},cookie)).status,403);assert.equal((await request('/api/account/library?kind=watchlist')).status,401);
 assert.equal((await request('/api/auth/request-password-reset',{email,redirectTo:origin+'/?account=reset'})).status,200);const reset=new URL(outbox.find(x=>x.subject.startsWith('Reset')).text.match(/https:\/\/\S+/)[0]);r=await request(reset.pathname+reset.search);const token=new URL(r.headers.get('location'),origin).searchParams.get('token');assert.ok(token);assert.equal((await request('/api/auth/reset-password',{token,newPassword:password+'new'})).status,200);assert.equal((await (await request('/api/account',null,cookie)).json()).user,null);assert.notEqual((await request('/api/auth/reset-password',{token,newPassword:password})).status,200);
 }finally{db.close();}
});
test('Cloudflare routing protects private assets, canonicalizes www, serves SEO and never turns a missing page into 200',async()=>{
 const env={SKYWARD_PUBLIC_ORIGIN:origin,COORDINATOR:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({allowed:false,status:401})})},ASSETS:{fetch:async()=>new Response('missing',{status:404})}};
 let r=await handle(new Request('https://www.skyvvard.com/contact/'),env);assert.equal(r.status,308);assert.equal(r.headers.get('location'),origin+'/contact/');r=await handle(new Request(origin+'/contact/'),env);assert.match(await r.text(),/mailto:contact@skyvvard.com/);assert.equal((await handle(new Request(origin+'/internal/cleanup'),env)).status,404);assert.equal((await handle(new Request(origin+'/airport-simulation/game.wasm'),env)).status,401);assert.equal((await handle(new Request(origin+'/not-a-page'),env)).status,404);assert.equal((await handle(new Request(origin+'/api/test',{method:'POST',body:'x'.repeat(65537)}),env)).status,413);
 const sitemap=publicPage(new URL(origin+'/sitemap.xml'),env).body;assert.match(sitemap,/<loc>https:\/\/skyvvard.com\/<\/loc>/);assert.match(sitemap,/\/contact\//);assert.doesNotMatch(sitemap,/\/account\//);
});

test('legal pages identify the supplied operator and are discoverable without signing in',()=>{
 const env={SKYWARD_PUBLIC_ORIGIN:origin};
 for(const path of ['/terms/','/privacy/']){const p=publicPage(new URL(origin+path),env);assert.equal(p.status,200);assert.match(p.body,/SSARI Inc\./);assert.match(p.body,/mailto:(?:contact|privacy)@skyvvard.com/);assert.ok(p.body.includes(`rel="canonical" href="${origin+path}"`));assert.equal(publicPage(new URL(origin+path.slice(0,-1)),env).location,path);assert.ok(publicPage(new URL(origin+'/sitemap.xml'),env).body.includes(origin+path));}
 assert.match(publicPage(new URL(origin+'/privacy/'),env).body,/does not by itself publish/);
 assert.match(publicPage(new URL(origin+'/terms/'),env).body,/Premium does not guarantee/);
});

test('D1 paid library writes round-trip, preserve ownership and delete cleanly',async()=>{
 const {db,binding}=localD1(),{pool,transaction}=d1Pool(binding);
 const user={id:'paid-u',name:'Member',email:'paid@example.invalid',emailVerified:true};
 db.prepare('INSERT INTO user VALUES(?,?,?,?,?,?,?)').run(user.id,user.name,user.email,1,null,'2026-01-01','2026-01-01');
 db.prepare('INSERT INTO skyward_profiles(user_id,stripe_customer) VALUES(?,?)').run(user.id,'cus_test');
 const env={NODE_ENV:'production',SKYWARD_ACCOUNTS:'d1',SKYWARD_PUBLIC_ORIGIN:origin,STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
 const auth={handler:async()=>new Response('unused'),api:{getSession:async({headers})=>headers.get('cookie')==='member=1'?{user}:null}};
 const membership=createAccountMembership({env,pool,auth,origin,transact:transaction,throttleRequest:async()=>{},fetchImpl:async()=>Response.json({data:[{livemode:false,status:'active',customer:'cus_test',latest_invoice:{customer:'cus_test',status:'paid',amount_paid:100},items:{data:[{price:{id:'price_fixture'},current_period_end:Math.floor(Date.now()/1000)+3600}]}}]})});
 const request=(path,body,member=true)=>nodeHandler(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(member?{Cookie:'member=1'}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),(req,res,url)=>membership.handle(req,res,url));
 try{
 let r=await request('/api/account/library',{kind:'watchlist',key:'abcdef',value:{hex:'abcdef',callsign:'TEST1'}});assert.equal(r.status,200,await r.clone().text());
 r=await request('/api/account/library?kind=watchlist&key=abcdef');assert.equal(r.status,200);assert.equal((await r.json()).value.hex,'abcdef');
 r=await request('/api/account/library',{kind:'aircraftfollows',key:'airframes',revision:0,value:{ids:['nasa-sca-905','nasa-sca-905']}});assert.equal(r.status,200,await r.clone().text());
 r=await request('/api/account/library?kind=aircraftfollows&key=airframes');assert.deepEqual((await r.json()).value.ids,['nasa-sca-905']);
 assert.equal((await request('/api/account/library',{kind:'aircraftfollows',key:'airframes',revision:0,value:{ids:[]}})).status,409);
 assert.equal((await request('/api/account/library?kind=aircraftfollows&key=airframes',null,false)).status,401);

 assert.equal((await request('/api/account/library?kind=watchlist&key=abcdef',null,false)).status,401);
 assert.equal((await request('/api/account/dashboard')).status,200);
 const raw=JSON.stringify({id:'evt_d1test',type:'invoice.paid',livemode:false,data:{object:{customer:'cus_test'}}}),t=Math.floor(Date.now()/1000),signature=createHmac('sha256','whsec_fixture').update(t+'.'+raw).digest('hex');
 r=await nodeHandler(new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${signature}`},body:raw}),(req,res,url)=>membership.handle(req,res,url));assert.equal(r.status,200,await r.clone().text());assert.equal(JSON.parse(db.prepare("SELECT body FROM skyward_premium_state WHERE kind='billing'").get().body).premium,true);

 r=await request('/api/account/library',{kind:'watchlist',key:'abcdef',remove:true});assert.equal(r.status,200,await r.clone().text());assert.equal((await request('/api/account/library?kind=watchlist&key=abcdef')).status,404);
 }finally{db.close();}
});

test('D1 paid lookup budgets reject user, service and spending exhaustion before provider calls',async()=>{
 for(const limit of [{SKYWARD_MONTHLY_LOOKUPS:'1'},{SKYWARD_GLOBAL_LOOKUPS:'1'},{SKYWARD_BUDGET_MICROS:'1000'}]){
  const {db,binding}=localD1(),{pool,transaction}=d1Pool(binding);let paid=true,calls=0;
  const env={NODE_ENV:'production',SKYWARD_ACCOUNTS:'d1',SKYWARD_BILLING_MODE:'live',SKYWARD_AIRLABS_MODE:'live',AIRLABS_API_KEY:'fixture',STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_PUBLISHABLE_KEY:'pk_live_fixture',STRIPE_PRICE_ANNUAL_ID:'price_year',STRIPE_WEBHOOK_SECRET:'whsec_fixture',...limit};
  db.prepare('INSERT INTO user VALUES(?,?,?,?,?,?,?)').run('budget-user','Member','budget@example.invalid',1,null,'2026-01-01','2026-01-01');db.prepare('INSERT INTO skyward_profiles VALUES(?,?)').run('budget-user','cus_budget');
  const membership=createAccountMembership({airlabsPermissions:verifiedAirLabs,env,pool,transact:transaction,origin,throttleRequest:async()=>{},auth:{api:{getSession:async()=>({user:{id:'budget-user',email:'budget@example.invalid',emailVerified:true}})}},fetchImpl:async url=>{
   if(String(url).startsWith('https://api.stripe.com/'))return Response.json({data:paid?[{livemode:true,status:'active',customer:'cus_budget',latest_invoice:{customer:'cus_budget',status:'paid',amount_paid:5999},items:{data:[{price:{id:'price_year'},current_period_end:Math.floor(Date.now()/1000)+3600}]}}]:[]});
   calls++;return Response.json({response:[]});
  }});
  const call=airport=>nodeHandler(new Request(origin+'/api/premium/schedules',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({airport,direction:'departures'})}),(req,res,url)=>membership.handle(req,res,url));
  try{
   assert.equal((await call('IAD')).status,200);assert.equal(calls,1);
   assert.equal((await call('IAD')).status,200);assert.equal(calls,1,'same query is cached');
   assert.equal((await call('IST')).status,429);assert.equal(calls,1,'exhausted budget makes no upstream request');
   paid=false;assert.equal((await call('IAD')).status,403,'free accounts cannot access the paid cache');assert.equal(calls,1);
  }finally{db.close();}
 }
});
