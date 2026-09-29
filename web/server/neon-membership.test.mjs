import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {neonConfig,createNeonPool} from './neon-auth.mjs';
import {createNeonMembership} from './neon-membership.mjs';
import {createConfiguredMembership} from './membership-config.mjs';
import {migrateNeon} from '../scripts/migrate-neon.mjs';

const base={SKYWARD_ACCOUNTS:'neon',SKYWARD_PUBLIC_ORIGIN:'https://skyward.example',BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),DATABASE_URL:'postgresql://test:placeholder@db.example/skyward?sslmode=require'};
test('Neon configuration requires TLS, a secret and explicit account mode',()=>{
 assert.equal(neonConfig(base).ssl.rejectUnauthorized,true);
 assert.ok(!neonConfig(base).connectionString.includes('sslmode'));
 for(const change of [{BETTER_AUTH_SECRET:''},{SKYWARD_PUBLIC_ORIGIN:'http://skyward.example'},{DATABASE_URL:'sqlite:local'},{SKYWARD_LOCAL_PREMIUM:'1'},{NODE_ENV:'production',DATABASE_URL:'postgresql://test@localhost/db'}])assert.throws(()=>neonConfig({...base,...change}));
});

test('Production rejects SQLite test accounts and unknown account backends',async()=>{
 await assert.rejects(createConfiguredMembership({env:{NODE_ENV:'production',SKYWARD_ACCOUNTS:'test'}}),/Production accounts/);
 await assert.rejects(createConfiguredMembership({env:{SKYWARD_ACCOUNTS:'typo'}}),/SKYWARD_ACCOUNTS/);
});

test('Better Auth + Postgres: verification, sessions, recovery, owned libraries and atomic limits',{skip:!process.env.SKYWARD_TEST_DATABASE_URL},async t=>{
 let membership;const outbox=[],ids=[],server=createServer(async(req,res)=>{try{if(!await membership.handle(req,res,new URL(req.url,env.SKYWARD_PUBLIC_ORIGIN))){res.writeHead(404);res.end();}}catch{res.writeHead(500);res.end('unexpected test error');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...base,DATABASE_URL:process.env.SKYWARD_TEST_DATABASE_URL,SKYWARD_PUBLIC_ORIGIN:`http://127.0.0.1:${server.address().port}`,STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_fixture',SKYWARD_GLOBAL_LOOKUPS:'1'};
 const pool=createNeonPool(env);let providerCalls=0;
 membership=createNeonMembership({env,pool,sendEmail:email=>outbox.push(email),fetchImpl:async(url)=>{
  providerCalls++;assert.ok(String(url).startsWith('https://api.stripe.com/v1/subscriptions?'));
  const customer=new URL(url).searchParams.get('customer');return Response.json({data:[{livemode:false,status:'active',customer,latest_invoice:{status:'paid',amount_paid:100,customer},items:{data:[{price:{id:'price_fixture'},current_period_end:Math.floor(Date.now()/1000)+3600}]}}]});
 }});
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));for(const id of ids)await pool.query('DELETE FROM "user" WHERE id=$1',[id]);await membership.close();});
 await migrateNeon(pool,membership.auth);await migrateNeon(pool,membership.auth);
 async function request(path,body,cookie='',origin=env.SKYWARD_PUBLIC_ORIGIN){const r=await fetch(env.SKYWARD_PUBLIC_ORIGIN+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return {status:r.status,data,cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),headers:r.headers};}
 assert.equal((await request('/api/auth/sign-up/email',{name:'Attacker',email:'nobody@example.test',password:'a long enough password'},'','https://evil.example')).status,403);
 const password='local testing password 123!',email=`neon-${randomUUID()}@example.test`;
 let r=await request('/api/auth/sign-up/email',{name:'Test Pilot',email,password});assert.equal(r.status,200,JSON.stringify(r.data));ids.push(r.data.user.id);
 assert.equal((await request('/api/account')).data.user,null);
 r=await request('/api/auth/sign-in/email',{email,password});assert.equal(r.status,403);
 await new Promise(r=>setTimeout(r,20));const verify=outbox.find(x=>x.subject.startsWith('Verify')&&x.to===email);assert.ok(verify);
 r=await request(new URL(verify.text.match(/https?:\/\/\S+/)[0]).pathname+new URL(verify.text.match(/https?:\/\/\S+/)[0]).search);assert.ok([200,302].includes(r.status),JSON.stringify(r.data));
 r=await request('/api/auth/sign-in/email',{email,password});assert.equal(r.status,200,JSON.stringify(r.data));const cookie=r.cookie;assert.ok(cookie.includes('skyward-auth'));assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await request('/api/account',undefined,cookie)).data.authProvider,'better-auth');
 assert.equal((await request('/api/account',undefined,cookie)).data.user.email,email);
 const watch={kind:'watchlist',key:'abcdef',value:{hex:'abcdef',callsign:'THY111'}};
 assert.equal((await request('/api/account/library',watch,cookie,'https://evil.example')).status,403);
 assert.equal((await request('/api/account/library',watch,cookie)).status,403);
 assert.equal((await request('/api/account/library',{kind:'views',key:'one',revision:0,value:{settings:{}}},cookie)).status,403);
 assert.equal((await membership.simulatorAccess({headers:{cookie}})).status,403);
 await pool.query('INSERT INTO skyward_profiles VALUES($1,$2)',[ids[0],`cus_${randomUUID().replaceAll('-','')}`]);
 assert.equal((await request('/api/account/library',watch,cookie)).status,200);
 assert.equal((await request('/api/account/library?kind=watchlist',undefined,cookie)).data.items.length,1);
 assert.equal((await request('/api/account/library?kind=watchlist')).status,401);
 // A second verified user cannot read or overwrite the first user's saved items.
 const email2=`neon-${randomUUID()}@example.test`;
 r=await request('/api/auth/sign-up/email',{name:'Other Pilot',email:email2,password});assert.equal(r.status,200);ids.push(r.data.user.id);
 await new Promise(r=>setTimeout(r,20));const v2=new URL(outbox.find(x=>x.to===email2).text.match(/https?:\/\/\S+/)[0]);await request(v2.pathname+v2.search);
 r=await request('/api/auth/sign-in/email',{email:email2,password});assert.equal(r.status,200);const cookie2=r.cookie;
 assert.equal((await request('/api/account/library?kind=watchlist&key=abcdef',undefined,cookie2)).status,404);
 assert.equal((await request('/api/account/library',watch,cookie2)).status,403);
 await pool.query('INSERT INTO skyward_profiles VALUES($1,$2)',[ids[1],`cus_${randomUUID().replaceAll('-','')}`]);
 assert.equal((await request('/api/account/library',watch,cookie2)).status,200);
 assert.equal((await request('/api/account/library?kind=watchlist',undefined,cookie)).data.items.length,1);
 // Concurrent inserts must not bypass the Premium watchlist count limit.
 const candidates=await Promise.all(Array.from({length:31},(_,i)=>{const hex=i.toString(16).padStart(6,'0');return request('/api/account/library',{kind:'watchlist',key:hex,value:{hex}},cookie2);}));
 assert.equal(candidates.filter(r=>r.status===200).length,29);assert.equal(candidates.filter(r=>r.status===429).length,2);
 assert.equal((await request('/api/account/library?kind=watchlist',undefined,cookie2)).data.items.length,30);
 // Only a server-side test subscription makes Premium libraries and simulation available.
 const view={kind:'views',key:'one',revision:0,value:{name:'Tower',settings:{}}};
 const parallel=await Promise.all([request('/api/account/library',view,cookie),request('/api/account/library',view,cookie)]);assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
 assert.equal((await membership.simulatorAccess({headers:{cookie}})).allowed,true);
 const journey={callsign:'THY111',hex:'abcdef',date:'2026-09-28',from:'IAD',to:'IST',alerts:true};
 assert.equal((await request('/api/journeys',journey,cookie)).status,200);const journeyKey='THY111:abcdef:2026-09-28';
 r=await request('/api/premium/details',{key:journeyKey},cookie);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.usage.actualProviderSpend,0);
 assert.equal((await request('/api/premium/details',{key:journeyKey},cookie)).status,429);
 assert.equal((await request('/api/journeys',{...journey,callsign:'THY222'},cookie)).status,200);
 assert.equal((await request('/api/premium/details',{key:'THY222:abcdef:2026-09-28'},cookie)).status,429);
 assert.equal((await request('/api/account/library',{kind:'journal',key:'spot',revision:0,value:{date:'2026-09-28',airport:'IAD',aircraftType:'B738'}},cookie)).status,200);
 assert.equal((await request('/api/premium/monitoring',{key:journeyKey,enabled:true},cookie)).status,200);
 await membership.premiumTick();
 assert.equal((await request('/api/premium/monitoring',undefined,cookie)).data.used,1);
 const share=await request('/api/premium/shares',{journeyKey,hours:1},cookie);assert.equal(share.status,200,JSON.stringify(share.data));
 const shared=await request(share.data.url);assert.equal(shared.status,200);assert.ok(!shared.data.includes(email));
 assert.equal((await request('/api/premium/shares',{key:share.data.key,remove:true},cookie)).status,200);
 const observation={mode:'live',status:'MATCHED_RECENT_AIRCRAFT',fetchedAt:Date.now(),flight:{callsign:'THY111',hex:'abcdef',status:'en-route',departure:{scheduledAt:'2026-09-28T10:00:00Z',gate:'A1'}}};
 await membership.recordVerifiedCheck(ids[0],journeyKey,observation);await membership.recordVerifiedCheck(ids[0],journeyKey,{...observation,fetchedAt:observation.fetchedAt+1000,flight:{...observation.flight,status:'landed'}});
 r=await request('/api/account/dashboard',undefined,cookie);assert.equal(r.status,200);assert.ok(r.data.alerts.length>0);assert.equal(r.data.alerts[0].read,false);
 assert.equal((await request('/api/account/alerts',{throughId:r.data.alerts[0].id},cookie)).status,200);
 assert.equal((await request('/api/account/dashboard',undefined,cookie)).data.alerts[0].read,true);
 assert.equal((await request('/api/account/dashboard',undefined,cookie2)).data.alerts.length,0);
 // Password recovery revokes previous sessions and its token cannot be reused.
 r=await request('/api/auth/request-password-reset',{email,redirectTo:env.SKYWARD_PUBLIC_ORIGIN+'/?account=reset'});assert.equal(r.status,200);
 await new Promise(r=>setTimeout(r,20));const reset=new URL(outbox.find(x=>x.to===email&&x.subject.startsWith('Reset')).text.match(/https?:\/\/\S+/)[0]);
 r=await request(reset.pathname+reset.search);assert.equal(r.status,302);const token=new URL(r.headers.get('location'),env.SKYWARD_PUBLIC_ORIGIN).searchParams.get('token');assert.ok(token);
 r=await request('/api/auth/reset-password',{token,newPassword:password+'new'});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal((await request('/api/account',undefined,cookie)).data.user,null);
 assert.notEqual((await request('/api/auth/reset-password',{token,newPassword:password})).status,200);
 await new Promise(r=>setTimeout(r,11000)); // Respect Better Auth's sign-in burst limit.
 r=await request('/api/auth/sign-in/email',{email,password:password+'new'});assert.equal(r.status,200);const nextCookie=r.cookie;
 assert.equal((await request('/api/auth/sign-out',{},nextCookie)).status,200);
 assert.equal((await request('/api/account',undefined,nextCookie)).data.user,null);
 assert.ok(providerCalls>0);
});
