import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createServer} from 'node:http';
import {createMembership} from './membership.mjs';import {sqlitePremiumStore} from './premium-store.mjs';import {createPremiumTools,validSubscription} from './premium-tools.mjs';import {validateLibrary} from './account-library.mjs';import {createAirportWeather} from './airport-weather.mjs';
test('Premium monitoring is durable, budgeted, excludes expired journeys and never publishes synthetic alerts',async t=>{
 const db=new DatabaseSync(':memory:'),store=sqlitePremiumStore(db);t.after(()=>db.close());let time=Date.parse('2026-09-28T12:00:00Z'),calls=0,paid=true;const u={id:'u'},j={key:'THY111:abcdef:2026-09-28',date:'2026-09-28',callsign:'THY111',from:'IAD',to:'IST'};
 const options={store,userById:()=>u,entitlement:async()=>paid,readJourney:()=>j,lookup:async()=>{calls++;return {mode:'demo'};},now:()=>time},tools=createPremiumTools(options);
 await tools.handle('/api/premium/monitoring','POST',u,{key:j.key,enabled:true});await Promise.all([tools.tick(),createPremiumTools(options).tick()]);assert.equal(calls,1);assert.equal(store.scan('push-outbox').length,0);
 await tools.tick();assert.equal(calls,1);for(let n=0;n<35;n++){time+=16*60000;await tools.tick();}assert.equal(calls,30);assert.equal((await tools.handle('/api/premium/monitoring','GET',u,{})).used,30);
 paid=false;time+=16*60000;await tools.tick();assert.equal(store.list('u','monitor').length,0);
 await assert.rejects(tools.handle('/api/premium/shares','POST',u,{}),e=>e.status===403);
});
test('Share links are scoped, private, expiring, revocable and ignore synthetic status',async t=>{
 const db=new DatabaseSync(':memory:'),store=sqlitePremiumStore(db);t.after(()=>db.close());let time=Date.now();const u={id:'u',email:'private@example.test'},j={key:'flight',callsign:'<script>alert(1)</script>',from:'IAD',to:'DCA',date:'2026-09-28',details:{mode:'demo',flight:{status:'FAKE ARRIVAL'}}};
 const tools=createPremiumTools({store,userById:()=>u,entitlement:async()=>true,readJourney:async(id,key)=>id==='u'&&key==='flight'?j:null,lookup:async()=>{},now:()=>time});
 await assert.rejects(tools.handle('/api/premium/shares','POST',{id:'other'},{journeyKey:'flight',hours:1}),e=>e.status===404);
 const share=await tools.handle('/api/premium/shares','POST',u,{journeyKey:'flight',hours:1});assert.ok(!JSON.stringify(store.list('u','share')).includes(share.url.slice(7)));
 const server=createServer((req,res)=>void tools.publicHandle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}`;
 const r=await fetch(url+share.url),html=await r.text();assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('private@example.test'));assert.ok(!html.includes('FAKE ARRIVAL'));
 time+=3600001;assert.equal((await fetch(url+share.url)).status,404);await tools.handle('/api/premium/shares','POST',u,{remove:true,key:share.key});assert.equal(store.list('u','share').length,0);
});
test('Push endpoints reject SSRF and send only queued server-verified summaries; expired subscriptions are removed',async t=>{
 for(const endpoint of ['http://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:444/x','https://user@fcm.googleapis.com/x'])assert.throws(()=>validSubscription({endpoint,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}));
 const db=new DatabaseSync(':memory:'),store=sqlitePremiumStore(db);t.after(()=>db.close());const u={id:'u'},sent=[],env={SKYWARD_VAPID_PUBLIC_KEY:'public',SKYWARD_VAPID_PRIVATE_KEY:'private',SKYWARD_VAPID_SUBJECT:'mailto:test@example.test'};
 const tools=createPremiumTools({store,env,userById:()=>u,entitlement:async()=>true,readJourney:()=>null,lookup:async()=>{},sendPush:async(s,p)=>{sent.push(JSON.parse(p));throw {statusCode:410};}});
 await tools.handle('/api/premium/notifications','POST',u,{subscription:{endpoint:'https://fcm.googleapis.com/push/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}});assert.equal(sent.length,0);
 await tools.notifyVerified('u','event-1','THY111: Arrival reported');await tools.tick();assert.equal(sent.length,1);assert.equal(sent[0].body,'THY111: Arrival reported');assert.equal(store.list('u','push').length,0);
});
test('Expired Premium accounts can still remove only their own notification subscriptions',async t=>{
 const db=new DatabaseSync(':memory:'),store=sqlitePremiumStore(db);t.after(()=>db.close());store.put('u','push','device',{created:1});store.put('other','push','device',{created:1});
 const tools=createPremiumTools({store,entitlement:async()=>false,userById:()=>null,readJourney:()=>null,lookup:()=>null});
 await tools.handle('/api/premium/notifications','POST',{id:'u'},{remove:true,key:'device'});assert.equal(store.get('u','push','device'),null);assert.ok(store.get('other','push','device'));
});
test('New libraries validate connections, photos, airports and simulation results',()=>{
 assert.throws(()=>validateLibrary('journal',{date:'2026-09-28',airport:'IAD',photo:'data:image/svg+xml;base64,PHN2Zz4='}));
 assert.throws(()=>validateLibrary('airports',{airport:'FAKE'}));
 assert.throws(()=>validateLibrary('trips',{name:'Invalid',legs:[{from:'IAD',to:'LHR',departureAt:10,arrivalAt:20},{from:'IST',to:'DCA',departureAt:30,arrivalAt:40}]}));
 assert.throws(()=>validateLibrary('missions',{from:'IAD',to:'DCA',difficulty:'easy',result:'landed',duration:-1,touchdownRate:0}));
 assert.equal(validateLibrary('journal',{date:'2026-09-28',airport:'IAD',aircraftType:'B738'}).aircraftType,'B738');
});
test('Weather coalesces requests and preserves observed time rather than pretending old reports are current',async()=>{let calls=0;const weather=createAirportWeather({now:()=>100000,fetchImpl:async()=>{calls++;return Response.json([{icaoId:'KIAD',obsTime:1,rawOb:'KIAD example observation'}]);}});const [a,b]=await Promise.all([weather('IAD'),weather('IAD')]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.observation.observedAt,1000);await weather('IAD');assert.equal(calls,1);await assert.rejects(weather('FAKE'));});
test('New Premium HTTP routes deny free users and background checks consume the existing shared lookup budget',async t=>{
 let time=Date.parse('2026-09-28T12:00:00Z'),m;const server=createServer(async(req,res)=>{await m.handle(req,res,new URL(req.url,origin));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 m=createMembership({dbPath:':memory:',now:()=>time,env:{SKYWARD_ACCOUNTS:'test',SKYWARD_LOCAL_PREMIUM:'1',SKYWARD_PUBLIC_ORIGIN:origin}});t.after(async()=>{await new Promise(r=>server.close(r));m.close();});
 let cookie='';async function request(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
 assert.equal((await request('/api/account/register',{email:'tools@example.test',password:'correct horse battery staple'})).status,200);
 for(const path of ['/api/premium/monitoring','/api/premium/notifications','/api/premium/shares'])assert.equal((await request(path)).status,403);
 assert.equal((await request('/api/account/library',{kind:'journal',key:'one',revision:0,value:{date:'2026-09-28',airport:'IAD'}})).status,403);
 const user=m.db.prepare('SELECT id FROM users').get();m.db.prepare('INSERT INTO local_test_access VALUES(?,?)').run(user.id,time+86400000);
 const journey={callsign:'THY111',hex:'abcdef',date:'2026-09-28',alerts:true};await request('/api/journeys',journey);await request('/api/premium/monitoring',{key:'THY111:abcdef:2026-09-28',enabled:true});await m.premiumTick();
 assert.equal((await request('/api/account')).data.usage.requests,1);assert.equal(m.db.prepare('SELECT COUNT(*) n FROM alerts').get().n,0);
 assert.equal((await request('/api/account/library',{kind:'journal',key:'one',revision:0,value:{date:'2026-09-28',airport:'IAD'}})).status,200);
});
