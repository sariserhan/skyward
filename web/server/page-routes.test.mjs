import test from 'node:test';
import assert from 'node:assert/strict';
import {observatoryRoute,aircraftPath,routeMetadata} from '../src/lib/pageRoutes.ts';
import {publicPage} from './public-pages.mjs';
import {observatoryDocument} from './observatory-document.mjs';
import {handle} from '../cloudflare/router.mjs';
const env={SKYWARD_PUBLIC_ORIGIN:'https://skyvvard.com'},page=p=>publicPage(new URL(p,env.SKYWARD_PUBLIC_ORIGIN),env);
const shell='<html><head><title>Wrong title</title><script type="module" crossorigin src="/watch/assets/main-abc.js"></script><link rel="stylesheet" href="/watch/assets/main-abc.css"></head><body><div id="root"></div></body></html>';
test('airport routes preserve catalog metadata and become interactive documents',()=>{
 const p=page('/airports/SFO/'),html=observatoryDocument(p,shell);
 assert.equal(p.observatory,true);assert.match(html,/San Francisco/);assert.match(html,/rel="canonical" href="https:\/\/skyvvard.com\/airports\/SFO\/"/);assert.match(html,/id="root"/);assert.match(html,/main-abc.js/);assert.doesNotMatch(html,/Wrong title|public-pages.css/);
 assert.equal(observatoryRoute('/airports/sfo').id,'SFO');assert.equal(page('/airports/sfo?x=1').location,'/airports/SFO/?x=1');assert.equal(page('/airports/ZZZ/').status,404);
});
test('dated flights validate calendar dates and are not indexed as verified journeys',()=>{
 assert.deepEqual(observatoryRoute('/flights/JBU2117/2026-09-30/'),{kind:'flight',code:'JBU2117',date:'2026-09-30'});
 for(const date of ['2026-02-30','2026-13-01']){assert.equal(observatoryRoute(`/flights/JBU2117/${date}/`),null);assert.equal(page(`/flights/JBU2117/${date}/`).status,404);}
 const p=page('/flights/JBU2117/2026-09-30/');assert.equal(p.observatory,true);assert.match(p.body,/noindex,follow/);assert.match(p.body,/2026-09-30/);assert.match(p.body,/does not provide a historical replay/);assert.match(p.body,/canonical.*\/flights\/JBU2117\/2026-09-30\//);assert.equal(page('/flights/jbu2117').location,'/flights/JBU2117/');
 assert.equal(aircraftPath({callsign:'JBU2117',simulation:{}}),'/');assert.equal(aircraftPath({callsign:'jbu2117'}),'/flights/JBU2117/');assert.equal(aircraftPath({callsign:'<x>'}),'/');assert.equal(routeMetadata('/flights/JBU2117/').noindex,true);assert.doesNotMatch(page('/sitemap.xml').body,/JBU2117|skyward-iad/);
});
test('Cloudflare direct links serve the same interactive shell, including HEAD and real 404s',async()=>{
 const config={...env,ASSETS:{fetch:async()=>new Response(shell)}};
 for(const path of ['/airports/SFO/','/flights/JBU2117/','/flights/JBU2117/2026-09-30/']){const r=await handle(new Request(env.SKYWARD_PUBLIC_ORIGIN+path),config);assert.equal(r.status,200);assert.match(await r.text(),/main-abc.js/);const head=await handle(new Request(env.SKYWARD_PUBLIC_ORIGIN+path,{method:'HEAD'}),config);assert.equal(head.status,200);assert.equal(await head.text(),'');}
 assert.equal((await handle(new Request(env.SKYWARD_PUBLIC_ORIGIN+'/airports/ZZZ/'),config)).status,404);
});
test('every catalog entry has a valid interactive route, including local identifiers',async()=>{
 const {default:catalog}=await import('../data/airport-catalog.json',{with:{type:'json'}});
 for(const id of Object.keys(catalog)){const path=`/airports/${id}/`;assert.equal(page(path)?.observatory,true,id);assert.equal(observatoryRoute(path)?.id,id);}
});
