import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelWarmup} from '../src/lib/sceneWarmup.ts';

test('model warmup fetches same-origin dependencies once and skips remote assets',async()=>{
 const original=globalThis.fetch,previous=globalThis.location,calls=[];
 globalThis.location={origin:'https://skyward.test'};
 globalThis.fetch=async(url,options)=>{calls.push([String(url),options]);return {ok:true,json:async()=>({buffers:[{uri:'plane.bin'},{uri:'https://other.test/remote.bin'}],images:[{uri:'data:image/png;base64,AAA'},{uri:'/logo.png'}]}),arrayBuffer:async()=>new ArrayBuffer(0)};};
 const warmer=createModelWarmup('https://skyward.test/watch/');
 try{warmer.add('models/plane.gltf');warmer.add('models/plane.gltf');await new Promise(resolve=>setTimeout(resolve,20));assert.deepEqual(calls.map(x=>x[0]),['https://skyward.test/watch/models/plane.gltf','https://skyward.test/watch/models/plane.bin','https://skyward.test/logo.png']);assert(calls.every(x=>x[1].cache==='force-cache'));warmer.dispose();warmer.add('other.gltf');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.length,3);assert(calls[0][1].signal.aborted);
 }finally{warmer.dispose();globalThis.fetch=original;if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});

test('selected models jump queued traffic and warmup continues past its bounded cache',async()=>{
 const original=globalThis.fetch,previous=globalThis.location,calls=[];let release;
 globalThis.location={origin:'https://skyward.test'};
 globalThis.fetch=async url=>{calls.push(String(url));if(String(url).endsWith('first.glb'))await new Promise(r=>release=r);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};};
 const warmer=createModelWarmup('https://skyward.test/');
 try{
  warmer.add('first.glb');warmer.add('traffic.glb');warmer.add('selected.glb',true);release();
  await new Promise(r=>setTimeout(r,15));assert.deepEqual(calls.map(x=>x.split('/').at(-1)),['first.glb','selected.glb','traffic.glb']);
  for(let i=0;i<30;i++){warmer.add(`next-${i}.glb`,true);await new Promise(r=>setTimeout(r,1));}
  assert.ok(calls.some(x=>x.endsWith('next-29.glb')));
 }finally{warmer.dispose();globalThis.fetch=original;if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
