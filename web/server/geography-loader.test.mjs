import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGeography,loadAirportGeometry} from '../src/lib/geographyLoader.ts';
test('geography recovers a temporary static-file failure and bypasses the failed cache',async(t)=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(options);return calls.length===1?new Response('',{status:503}):Response.json({type:'FeatureCollection',features:[]});});
 const result=await loadGeography('/world.geojson',new AbortController().signal);assert.equal(result.type,'FeatureCollection');assert.equal(calls.length,2);assert.equal(calls[1].cache,'reload');
});
test('aborting a geography load cancels its retry without affecting other requests',async(t)=>{
 const controller=new AbortController();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('offline');});const pending=loadGeography('/world.geojson',controller.signal);await Promise.resolve();controller.abort();await assert.rejects(pending);assert.equal(calls,1);
});

test('airport loader rejects a mismatched airport before accepting validated geometry',async(t)=>{
 const calls=[];const airport={id:'IAD',lat:38.95,lon:-77.46,runways:[],surfaces:[],paths:[],gates:[]};
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(options);return Response.json(calls.length===1?{...airport,id:'LHR'}:airport);});
 const result=await loadAirportGeometry('/IAD.json','IAD',new AbortController().signal);
 assert.equal(result.id,'IAD');assert.equal(calls.length,2);assert.equal(calls[1].cache,'reload');
});
