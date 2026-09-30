import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextObservationLookup} from '../src/lib/observationPolling.ts';
import {handle} from '../cloudflare/router.mjs';

const now=100000;
const row={hex:'abc123',observedAt:now-2000,lat:38,lon:-77};
test('regional observations avoid duplicate lookups only within the existing freshness window',()=>{
 assert.equal(nextObservationLookup(row,now),now+8000);
 assert.equal(nextObservationLookup({...row,observedAt:now-10000},now),now);
 for(const changed of [{observedAt:null},{observedAt:NaN},{observedAt:now+1},{lat:null},{lon:NaN},{positionWarning:'Retained fix'}])assert.equal(nextObservationLookup({...row,...changed},now),now);
 assert.equal(nextObservationLookup(undefined,now),now);
 assert.equal(nextObservationLookup({...row,hex:'skyward-demo'},now),Infinity);
});
test('freshness expiry follows observation time even if retained rows are ingested repeatedly',()=>{
 let requests=0,last=row;
 for(let t=now;t<now+60000;t+=1000){if(nextObservationLookup(last,t)<=t){requests++;last={...last,observedAt:t};}}
 assert.equal(requests,6);
 assert.equal(nextObservationLookup(row,now+60000),now+60000);
});
test('public models bypass R2 and entitlement checks while missing models remain 404',async()=>{
 let calls=0;
 const env={ASSETS:{fetch:async r=>{calls++;return r.url.endsWith('known.glb')?new Response('model-bytes'):new Response('',{status:404});}},MEDIA:{get:()=>assert.fail('Public model must not read R2')},COORDINATOR:{get:()=>assert.fail('Public model must not check accounts')}};
 const response=await handle(new Request('https://skyvvard.com/watch/models/known.glb'),env);
 assert.equal(await response.text(),'model-bytes');
 assert.equal((await handle(new Request('https://skyvvard.com/watch/models/missing.glb'),env)).status,404);
 assert.equal(calls,2);
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.ok(!config.assets.run_worker_first.includes('/watch/models/*'));
});
