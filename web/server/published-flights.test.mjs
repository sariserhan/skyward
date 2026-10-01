import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PublishedFlights,publicationCandidate} from './published-flights.mjs';
import {fileFlightCatalog} from './published-flights-node.mjs';
import {publicPage} from './public-pages.mjs';
import {handle} from '../cloudflare/router.mjs';
const now=Date.now(),origin='https://skyvvard.com',env={SKYWARD_PUBLIC_ORIGIN:origin};
const aircraft={hex:'abcdef',callsign:'JBU2117',targetKind:'aircraft',lat:39,lon:-77,observedAt:now,aircraftType:'A320',registration:'NTEST'};
const route={callsign:'JBU2117',status:'PLAUSIBLE',fetchedAt:now,airports:[{icao:'KIAD'},{icao:'KJFK'}]};
const feedFor=(rows=[aircraft])=>({primary:{cache:new Map([['area',{value:{aircraft:rows}}]])}});
const candidate=()=>publicationCandidate(route,feedFor(),39,-77,now);
test('publication requires real recent unambiguous observations and a plausible two-airport route',()=>{
 assert.equal(candidate().code,'JBU2117');
 for(const status of ['UNVERIFIED','POSITION_MISMATCH','NOT_FOUND'])assert.equal(publicationCandidate({...route,status},feedFor(),39,-77,now),null);
 for(const row of [{...aircraft,simulation:{}},{...aircraft,observedAt:now-300001},{...aircraft,observedAt:now+6000},{...aircraft,targetKind:'vehicle'},{...aircraft,lat:null}])assert.equal(publicationCandidate(route,feedFor([row]),39,-77,now),null);
 assert.equal(publicationCandidate(route,feedFor([]),39,-77,now),null);
 assert.equal(publicationCandidate(route,feedFor([aircraft,{...aircraft,hex:'123abc'}]),39,-77,now),null);
 assert.equal(publicationCandidate(route,feedFor(),0,0,now),null);
 assert.equal(publicationCandidate({...route,airports:[{icao:'XXXX'},{icao:'KJFK'}]},feedFor(),39,-77,now),null);
 assert.equal(publicationCandidate({...route,airports:[...route.airports,{icao:'EGLL'}]},feedFor(),39,-77,now),null);
});
test('catalog persists, deduplicates, throttles observation writes and updates route changes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'flight-catalog-'));try{
  const path=join(dir,'flights.json'),store=fileFlightCatalog(path);
  assert.equal(await store.observe(route,feedFor(),39,-77,now),true);
  assert.equal(await store.observe(route,feedFor(),39,-77,now),false);
  assert.equal((await fileFlightCatalog(path).records()).length,1);
  const next=now+1000,r={...route,fetchedAt:next},feed=feedFor([{...aircraft,observedAt:next}]);
  assert.equal(await store.observe(r,feed,39,-77,next),false);
  assert.equal(await store.observe({...r,airports:[{icao:'KIAD'},{icao:'EGLL'}]},feed,39,-77,next),true);
  const saved=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(saved[0].airports,['IAD','LHR']);
  assert.equal((await fileFlightCatalog(path).records())[0].observedAt,next);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('storage failure does not advertise an unpersisted flight and can recover',async()=>{
 let fails=true;const store=new PublishedFlights({save:async()=>{if(fails)throw Error('disk');}});
 await assert.rejects(store.observe(route,feedFor(),39,-77,now));assert.deepEqual(await store.records(),[]);
 fails=false;assert.equal(await store.observe(route,feedFor(),39,-77,now),true);
});
test('published profiles and sitemap share eligibility; unknown and dated lookups stay excluded',()=>{
 const flights=[candidate()],page=path=>publicPage(new URL(path,origin),env,{flights});
 const profile=page('/flights/JBU2117/');assert.equal(profile.status,200);assert.ok(!profile.observatory);assert.doesNotMatch(profile.body,/noindex|special-flights\.js/);
 for(const text of ['JetBlue','/airports/IAD/','/airports/JFK/','Last retained aircraft observation','ADSB.lol','NTEST','not a confirmed flight plan'])assert.ok(profile.body.includes(text),text);
 assert.match(profile.body,/canonical.*\/flights\/JBU2117\//);
 assert.match(page('/sitemap.xml').body,/<loc>https:\/\/skyvvard.com\/flights\/JBU2117\/<\/loc><lastmod>/);
 assert.match(page('/flights/').body,/href="\/flights\/JBU2117\/"/);
 assert.equal(page('/flights/JBU2117/?live=1').observatory,true);
 assert.match(page('/flights/JBU2117/?live=1').body,/noindex,follow/);
 assert.match(page('/flights/FAKE123/').body,/noindex,follow/);
 assert.match(page('/flights/JBU2117/2026-09-30/').body,/noindex,follow/);
 assert.equal(page('/flights/jbu2117').location,'/flights/JBU2117/');
 const escaped=publicPage(new URL('/flights/JBU2117/',origin),env,{flights:[{...candidate(),registration:'<script>alert(1)'}]});assert.ok(escaped.body.includes('&lt;script&gt;'));
});
test('edge renders persisted flight pages and sitemap without forwarding credentials; failures return 503',async()=>{
 const flights=[candidate()],config={...env,COORDINATOR:{idFromName:n=>n,get:()=>({fetch:async request=>{
  assert.equal(request.headers.get('cookie'),null);const url=new URL(request.url);assert.equal(url.pathname,'/internal/flight-pages');
  return Response.json(publicPage(new URL(url.searchParams.get('path'),origin),env,{flights}));
 }})}};
 for(const path of ['/flights/JBU2117/','/flights/','/sitemap.xml']){
  const r=await handle(new Request(origin+path,{headers:{Cookie:'private=1'}}),config);assert.equal(r.status,200);assert.ok((await r.text()).includes('JBU2117'));
  const head=await handle(new Request(origin+path,{method:'HEAD'}),config);assert.equal(head.status,200);assert.equal(await head.text(),'');
 }
 config.COORDINATOR.get=()=>({fetch:async()=>new Response('',{status:503})});assert.equal((await handle(new Request(origin+'/sitemap.xml'),config)).status,503);
});
