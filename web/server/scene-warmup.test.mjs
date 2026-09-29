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
