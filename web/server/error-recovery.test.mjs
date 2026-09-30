import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecovery,consumeErrorRecovery,restoredRecovery,registerRecoveryProvider,captureRecovery} from '../src/lib/errorRecovery.ts';
test('recovery rejects stale, future, corrupt and oversized snapshots',()=>{
 const valid={hash:'#airport=IAD&aircraft=abcdef&scene=flight&view=orbit',time:100000};
 assert.equal(parseRecovery(JSON.stringify(valid),100000).hash,valid.hash);
 for(const raw of [null,'{',JSON.stringify({...valid,time:1}),JSON.stringify({...valid,time:99999999}),'x'.repeat(2000001)])assert.equal(parseRecovery(raw,4000000),null);
});
test('recovery is consumed once and preserves the last healthy snapshot after unmount',()=>{
 const map=new Map([['skyward.error-recovery.v1',JSON.stringify({hash:'#airport=IAD&view=bird',time:Date.now()})]]);
 globalThis.sessionStorage={getItem:k=>map.get(k)??null,removeItem:k=>map.delete(k)};
 assert.ok(consumeErrorRecovery());assert.equal(map.size,0);assert.ok(restoredRecovery());assert.equal(consumeErrorRecovery(),restoredRecovery());
 const snapshot={hash:'#airport=IAD',time:Date.now()};const remove=registerRecoveryProvider(()=>snapshot);assert.equal(captureRecovery(),snapshot);remove();assert.equal(captureRecovery(),snapshot);
 delete globalThis.sessionStorage;
});
