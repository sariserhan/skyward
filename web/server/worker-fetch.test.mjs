import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerFetch} from '../cloudflare/fetch.mjs';
test('Worker transport rejects redirects without following or leaking credentials',async()=>{
 let calls=0;
 const transport=createWorkerFetch(async(url,options)=>{calls++;assert.equal(url,'https://api.example.invalid/');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer secret');return new Response('redirect',{status:302,headers:{Location:'https://other.invalid/'}});});
 await assert.rejects(transport('https://api.example.invalid/',{redirect:'error',headers:{Authorization:'Bearer secret'}}),/redirect rejected/);assert.equal(calls,1);
});
test('Worker transport preserves successful response and explicit manual handling',async()=>{
 const transport=createWorkerFetch(async(_url,options)=>{assert.equal(options.redirect,'manual');return Response.json({ok:true});});
 assert.deepEqual(await (await transport('https://api.example.invalid/',{redirect:'error'})).json(),{ok:true});
 const manual=createWorkerFetch(async()=>new Response(null,{status:307}));assert.equal((await manual('https://api.example.invalid/',{redirect:'manual'})).status,307);
});
