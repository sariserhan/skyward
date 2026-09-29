import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {publicPage,publicOrigin} from './public-pages.mjs';
import {authorizedMetrics,clientAddress,createOperations} from './operations.mjs';
import {FeedClient} from './feed.mjs';
const env={SKYWARD_PUBLIC_ORIGIN:'https://skyward.example'};
const page=path=>publicPage(new URL(path,'https://unused.invalid'),env);
test('airport pages have real catalog facts and canonical links without a globe dependency',()=>{
 const p=page('/airports/TAS/');assert.equal(p.status,200);assert.match(p.body,/Tashkent/);assert.match(p.body,/#airport=TAS/);assert.match(p.body,/rel="canonical" href="https:\/\/skyward.example\/airports\/TAS\/"/);assert.doesNotMatch(p.body,/<script|Cesium|live flight count: /);
 assert.equal(page('/airports/tas').location,'/airports/TAS/');assert.equal(page('/airports/XXX/').status,404);
});
test('directory query is escaped, bounded, searchable and paginated',()=>{
 const p=page('/airports/?q=Tashkent');assert.match(p.body,/\/airports\/TAS\//);assert.match(p.body,/noindex,follow/);
 const injected=page('/airports/?q=%22%3E%3Cscript%3E');assert.doesNotMatch(injected.body,/<script>/);assert.match(injected.body,/&lt;script&gt;/);
 assert.match(page('/airports/?page=2').body,/page 2 of/);assert.ok((page('/airports/').body.match(/<li>/g)??[]).length<=60);
});
test('sitemap uses configured origin only and excludes accounts and unverified flights',()=>{
 const p=page('/sitemap.xml');assert.match(p.body,/https:\/\/skyward.example\/airports\/TAS\//);assert.doesNotMatch(p.body,/\/account\/|\/flights\/THY/);
 assert.equal(publicPage(new URL('https://spoof.invalid/sitemap.xml'),{}).status,503);assert.equal(publicOrigin('javascript:alert(1)'), '');assert.equal(publicOrigin('https://user:secret@example.com'),'');
 assert.match(page('/flights/THY111/').body,/noindex,follow/);assert.match(page('/flights/THY111/').body,/\?flight=THY111/);assert.equal(page('/flights/?q=thy111').location,'/flights/THY111/');
});
test('metrics require a strong configured bearer token and contain aggregate counts only',()=>{
 const token='a'.repeat(32);assert.equal(authorizedMetrics('Bearer '+token,token),true);assert.equal(authorizedMetrics('Bearer wrong',token),false);assert.equal(authorizedMetrics(undefined,undefined),false);assert.equal(authorizedMetrics('Bearer short','short'),false);
 const op=createOperations(),res=new EventEmitter();res.statusCode=503;res.writableFinished=true;op.observe(res);res.emit('finish');res.emit('close');const s=op.snapshot();assert.equal(s.requests,1);assert.equal(s.errors,1);assert.equal(s.inFlight,0);assert.equal(s.statuses[503],1);
});
test('forwarded addresses are trusted only for explicit loopback proxy configuration',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'1.1.1.1, 8.8.8.8'}};
 assert.equal(clientAddress(req),'127.0.0.1');assert.equal(clientAddress(req,true),'8.8.8.8');req.socket.remoteAddress='192.0.2.4';assert.equal(clientAddress(req,true),'192.0.2.4');
});
test('identical failed requests are suppressed, never turned into empty observations',async()=>{
 let calls=0;const c=new FeedClient(async()=>{calls++;throw Error('offline');});
 await assert.rejects(c.search('hex','abcdef'));await assert.rejects(c.search('hex','abcdef'));assert.equal(calls,1);assert.equal(c.stats.suppressed,1);assert.equal(c.cache.size,0);
});
test('provider circuit opens after repeated network failures while cached fixes retain their time',async()=>{
 let failing=false,calls=0;const c=new FeedClient(async()=>{calls++;if(failing)throw Error('offline');return {ok:true,json:async()=>({ac:[],now:Date.now()})};});
 const original=await c.search('hex','abcdef');failing=true;
 for(const hex of ['111111','222222','333333']){c.nextAt=0;await assert.rejects(c.search('hex',hex));}
 assert.ok(c.cooldowns.get('https://api.adsb.lol')>Date.now());await assert.rejects(c.search('hex','444444'));assert.equal(calls,4);
 assert.equal((await c.search('hex','abcdef')).fetchedAt,original.fetchedAt);
});
