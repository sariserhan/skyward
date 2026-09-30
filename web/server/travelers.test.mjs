import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {sqlitePremiumStore} from './premium-store.mjs';
import {createTravelers} from './travelers.mjs';
async function fixture(t){
 const db=new DatabaseSync(':memory:'),store=sqlitePremiumStore(db);t.after(()=>db.close());
 const state={now:Date.parse('2026-09-30T12:00:00Z'),paid:true,rows:[]},u={id:'owner',email:'private@example.test'},j={key:'trip',date:'2026-09-30',callsign:'THY111',hex:'abcdef',from:'IAD',to:'IST',seat:'14A',bookingReference:'SECRET'};
 const tools=createTravelers({env:{SKYWARD_METRICS_TOKEN:'test-only-metrics-token-1234567890'},store,now:()=>state.now,entitlement:()=>state.paid,userById:id=>id===u.id?u:null,readJourney:(id,key)=>id===u.id&&key===j.key?j:null,observations:()=>state.rows});
 const server=createServer((req,res)=>void tools.publicHandle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`,publish=(extra={},user=u)=>tools.handle('/api/premium/travelers','POST',user,{alias:'Jane',journeyKey:'trip',side:'left',position:'wing',hours:1,consent:true,...extra});
 return {tools,store,state,u,j,url,publish};
}
test('Public travelers require Premium, own journey and explicit consent; revocation works after downgrade',async t=>{
 const f=await fixture(t);await assert.rejects(f.publish({consent:false}),e=>e.status===400);await assert.rejects(f.publish({}, {id:'other'}),e=>e.status===404);
 await assert.rejects(f.publish({alias:'<script>'}),e=>e.status===400);await assert.rejects(f.publish({hours:168}),e=>e.status===400);
 f.state.paid=false;await assert.rejects(f.publish(),e=>e.status===403);f.state.paid=true;
 const p=await f.publish();await f.publish();await f.publish();await assert.rejects(f.publish(),e=>e.status===429);
 await f.tools.handle('/api/premium/travelers','POST',{id:'other'},{remove:true,key:p.key});assert.ok(await f.store.get(f.u.id,'traveler',p.key));
 f.state.paid=false;assert.equal((await fetch(f.url+'/api/travelers/'+p.key)).status,404);
 await f.tools.handle('/api/premium/travelers','POST',f.u,{remove:true,key:p.key});assert.equal(await f.store.get(f.u.id,'traveler',p.key),null);
});
test('Public projection excludes private data, rejects stale/wrong/simulated matches and expires',async t=>{
 const f=await fixture(t),p=await f.publish({email:'LEAK',seat:'LEAK',bookingReference:'LEAK'}),path=f.url+'/api/travelers/'+p.key;
 const obs={hex:'abcdef',callsign:'THY111',targetKind:'aircraft',lat:39,lon:-77,observedAt:f.state.now};f.state.rows=[obs];
 let r=await fetch(path),d=await r.json();assert.equal(d.hex,'abcdef');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');
 for(const secret of ['owner','private@example.test','14A','SECRET','LEAK','journeyKey','userId'])assert.ok(!JSON.stringify(d).includes(secret));
 for(const row of [{...obs,simulation:true},{...obs,observedAt:f.state.now-121000},{...obs,callsign:'OTHER'},{...obs,hex:'123456'},{...obs,positionWarning:'bad'}]){f.state.rows=[row];assert.equal((await(await fetch(path)).json()).hex,null);}
 f.state.rows=[obs,obs];assert.equal((await(await fetch(path)).json()).hex,null);f.state.rows=[obs];f.j.date='2026-09-29';assert.equal((await(await fetch(path)).json()).hex,null);
 const html=await(await fetch(f.url+'/travelers/')).text();assert.match(html,/Jane’s journey/);assert.match(html,/self-reported/);assert.ok(!html.includes('14A'));assert.ok(!html.includes('SECRET'));
 f.state.now+=3600001;assert.equal((await fetch(path)).status,404);await f.tools.tick();assert.equal(f.store.list(f.u.id,'traveler').length,0);assert.match(await(await fetch(f.url+'/travelers/')).text(),/No travelers are sharing/);
});
test('Private windows are owner-only, invitations stay out of directory, and public search filters route/date',async t=>{
 const f=await fixture(t),privateTrip=await f.publish({visibility:'private',alias:'PrivateAlias'}),invite=await f.publish({visibility:'link',alias:'InviteAlias'}),pub=await f.publish({visibility:'public',alias:'PublicAlias'});
 assert.equal((await fetch(f.url+'/api/travelers/'+privateTrip.key)).status,404);assert.equal((await fetch(f.url+'/api/travelers/'+invite.key)).status,200);
 assert.equal((await f.tools.handle('/api/premium/travelers/'+privateTrip.key,'GET',f.u,{})).alias,'PrivateAlias');await assert.rejects(f.tools.handle('/api/premium/travelers/'+privateTrip.key,'GET',{id:'other'},{}),e=>e.status===404);
 const html=await(await fetch(f.url+'/travelers/?from=IAD&to=IST&date=2026-09-30')).text();assert.match(html,/PublicAlias/);assert.ok(!html.includes('PrivateAlias')&&!html.includes('InviteAlias'));
 assert.ok(!(await(await fetch(f.url+'/travelers/?to=LHR')).text()).includes('PublicAlias'));
});
test('Guest reactions enforce origin, cooldown, ownership and blocks; reports are moderated with operator auth',async t=>{
 const f=await fixture(t),p=await f.publish(),url=f.url+'/api/travelers/'+p.key,response=await fetch(url),cookie=response.headers.get('set-cookie').split(';')[0];
 const post=(body,origin='http://localhost:8000')=>fetch(url,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post({action:'react',kind:'wave'},'https://attacker.invalid')).status,403);
 assert.equal((await post({action:'react',kind:'wave'})).status,200);f.state.now+=3000;assert.equal((await post({action:'react',kind:'heart'})).status,429);
 const own=await f.tools.handle('/api/premium/travelers','GET',f.u,{}),guest=own.items[0].reactions[0].guestId;const publicData=await(await fetch(url)).json();assert.equal(publicData.reactions[0].kind,'wave');assert.ok(!JSON.stringify(publicData).includes(guest));
 await assert.rejects(f.tools.handle('/api/premium/travelers','POST',{id:'other'},{key:p.key,blockGuest:guest}),e=>e.status===404);
 await f.tools.handle('/api/premium/travelers','POST',f.u,{key:p.key,blockGuest:guest});f.state.now+=11000;assert.equal((await post({action:'react',kind:'heart'})).status,403);
 f.state.now+=3000;assert.equal((await post({action:'report',reason:'privacy'})).status,200);f.state.now+=3000;assert.equal((await post({action:'report',reason:'privacy'})).status,429);
 const mod=f.url+'/api/travelers/moderation';assert.equal((await fetch(mod)).status,401);
 const headers={Authorization:'Bearer test-only-metrics-token-1234567890','Content-Type':'application/json'};
 const reports=await(await fetch(mod,{headers})).json();assert.equal(reports.reports[0].value.counts.privacy,1);
 assert.equal((await fetch(mod,{method:'POST',headers,body:JSON.stringify({key:p.key,action:'hide'})})).status,200);assert.equal((await fetch(url)).status,404);
});
