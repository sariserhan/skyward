import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredFeed,CombinedFeed,mergeFeeds,flyItalyPath} from './combined-feed.mjs';
const now=Date.now(),a={hex:'abcdef',lat:40,lon:33,observedAt:now-10000,registration:'TEST',aircraftType:'A320'};
const payload=rows=>({aircraft:rows,sourceAt:now,fetchedAt:now,source:'fixture'});
test('FlyItaly uses km and documented lookup paths, never arbitrary URLs',()=>{
 assert.equal(flyItalyPath('/v2/point/40.1/33/25'),'/v2/lat/40.1/lon/33/dist/47');
 assert.equal(flyItalyPath('/v2/hex/ABCDEF'),'/v2/icao/ABCDEF');assert.equal(flyItalyPath('/v2/callsign/THY7'),'/v2/callsign/THY7');assert.throws(()=>flyItalyPath('/other'));
});
test('no key or disabled flag means no additional requests',async()=>{
 for(const env of [{},{SKYWARD_FLYITALY_API_KEY:'test-secret',SKYWARD_FLYITALY_ENABLED:'0'}]){
 const urls=[];const f=configuredFeed({env,fetchImpl:async u=>{urls.push(u);return {ok:true,json:async()=>({now:Date.now(),ac:[]})};}});
 await f.area('ESB');assert.equal(urls.length,1);assert.match(urls[0],/^https:\/\/api.adsb.lol\//);assert.equal(f.sources.length,1);
 }
});
test('key stays in supplemental header, shared requests cache, key never appears in sources',async()=>{
 const urls=[];const f=configuredFeed({env:{SKYWARD_FLYITALY_API_KEY:'test-secret'},fetchImpl:async(u,o)=>{urls.push(u);assert.ok(!u.includes('test-secret'));if(u.includes('flyitaly')){assert.equal(o.headers['X-Api-Key'],'test-secret');assert.equal(o.redirect,'manual');}else assert.equal(o.headers['X-Api-Key'],undefined);return {ok:true,json:async()=>({now:Date.now(),ac:[]})};}});
 await Promise.all([f.cameraArea(40,33,25),f.cameraArea(40,33,25)]);assert.equal(urls.length,2);await f.cameraArea(40,33,25);assert.equal(urls.length,2);assert.ok(!JSON.stringify(f.sources).includes('test-secret'));
});
test('newest whole fix wins; older duplicates, impossible jumps and future timestamps do not',()=>{
 const data=mergeFeeds([{id:'base',data:payload([a])},{id:'extra',data:payload([{...a,lon:33.01,observedAt:now},{...a,hex:'bbbbbb',observedAt:now+10000}])}],now);
 assert.equal(data.aircraft.length,1);assert.equal(data.aircraft[0].lon,33.01);assert.equal(data.aircraft[0].positionSource,'extra');
 const conflict=mergeFeeds([{id:'base',data:payload([a])},{id:'extra',data:payload([{...a,lon:-77,observedAt:now}])}],now);assert.equal(conflict.aircraft[0].observedAt,a.observedAt);assert.match(conflict.aircraft[0].positionWarning,/Conflicting/);
});
test('either source can carry traffic during an outage; total outage remains an error',async()=>{
 const ok={cameraArea:async()=>payload([a]),search:async()=>payload([a])},bad={cameraArea:async()=>{throw Error('down');},search:async()=>{throw Error('down');}};
 for(const [p,s] of [[ok,bad],[bad,ok]]){const f=new CombinedFeed(p,[{id:'extra',name:'extra',client:s}]);assert.equal((await f.cameraArea(40,33,25)).partial,true);assert.equal((await f.search('hex','abcdef')).aircraft.length,1);}
 await assert.rejects(new CombinedFeed(bad).cameraArea(40,33,25));
});
test('429 cooldown prevents supplemental retries without stopping the base feed',async()=>{
 let extra=0;const f=configuredFeed({env:{SKYWARD_FLYITALY_API_KEY:'test-secret'},fetchImpl:async u=>{if(u.includes('flyitaly')){extra++;return {ok:false,status:429,headers:new Headers({'Retry-After':'60'})};}return {ok:true,json:async()=>({now:Date.now(),ac:[]})};}});
 assert.equal((await f.cameraArea(40,33,25)).partial,true);assert.equal((await f.cameraArea(40,33,25)).partial,true);assert.equal(extra,1);
});
test('malformed supplemental payload never becomes a successful empty live response',async()=>{
 const f=configuredFeed({env:{SKYWARD_FLYITALY_API_KEY:'test-secret'},fetchImpl:async u=>({ok:true,json:async()=>u.includes('flyitaly')?{error:'bad key'}:{now:Date.now(),ac:[]}})});
 const r=await f.cameraArea(40,33,25);assert.equal(r.partial,true);assert.deepEqual(r.failedSources,['flyitaly']);
});

test('supplemental redirects are rejected without forwarding the API key',async()=>{
 let calls=0;
 const f=configuredFeed({env:{SKYWARD_FLYITALY_API_KEY:'private-key'},fetchImpl:async(url,options)=>{
  calls++;
  if(url.includes('flyitaly')){assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://example.invalid'}});}
  return Response.json({now:Date.now(),ac:[]});
 }});
 const data=await f.cameraArea(39,-77,50);
 assert.equal(calls,2);assert.equal(data.partial,true);assert.deepEqual(data.failedSources,['flyitaly']);
});
