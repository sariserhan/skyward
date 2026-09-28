import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedClient } from './feed.mjs';
test('overload is bounded, duplicate requests still share work, and expired work never hits the provider',async()=>{
  let release, calls=0;
  const client=new FeedClient(async()=>{ calls++;await new Promise(r=>{release=r;});return {ok:true,json:async()=>({now:Date.now()/1000,ac:[]})}; });
  const first=client.request('/v2/hex/000000');
  await new Promise(r=>setImmediate(r));
  const duplicate=client.request('/v2/hex/000000');
  const waiting=Array.from({length:15},(_,i)=>client.request(`/v2/hex/${(i+1).toString(16).padStart(6,'0')}`));
  const settled=Promise.allSettled(waiting);
  await assert.rejects(client.request('/v2/hex/abcdef'),/busy/);
  const realNow=Date.now;
  try {
    Date.now=()=>realNow()+16000;
    release();const result=await first;assert.equal(await duplicate,result);
    assert.ok((await settled).every(r=>r.status==='rejected'&&/expired/.test(r.reason.message)));
    assert.equal(calls,1);assert.equal(client.pending.size,0);
  } finally {Date.now=realNow;}
});

test('429 pauses new and already queued upstream work, honors Retry-After, and later recovers',async()=>{
 let calls=0;
 const client=new FeedClient(async()=>{calls++;return calls===1?{ok:false,status:429,headers:new Headers({'Retry-After':'120'})}:{ok:true,json:async()=>({now:Date.now()/1000,ac:[]})};});
 const settled=await Promise.allSettled([client.cameraArea(41,29,100),client.cameraArea(40,28,100)]);
 assert.equal(calls,1);assert.ok(settled.every(r=>r.status==='rejected'&&r.reason.retryAfter>100));
 await assert.rejects(client.search('hex','abcdef'),e=>e.retryAfter>100);assert.equal(calls,1);
 const actual=Date.now;try{Date.now=()=>actual()+121000;await client.cameraArea(41,29,100);assert.equal(calls,2);}finally{Date.now=actual;}
});
