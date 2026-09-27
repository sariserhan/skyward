import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {recentFlights,discoverFlights,trafficBoard,sanitizeFavorites} from '../src/lib/discovery.ts';
import {suggestedQuality,lowerQuality} from '../src/lib/adaptiveQuality.ts';
import {appendTrail} from '../src/lib/aircraft.ts';
const now=1000000,a={hex:'abcdef',callsign:'THY1',registration:'TEST',aircraftType:'A320',targetKind:'aircraft',lat:38.947,lon:-77.46,observedAt:now,ground:false,altitude:1000,groundSpeed:200};
test('discovery rejects stale, future, invalid and non-aircraft observations and sorts by distance',()=>{
 assert.equal(recentFlights([a,{...a,observedAt:now-30001},{...a,observedAt:now+6000},{...a,lat:NaN},{...a,lon:null},{...a,targetKind:'vehicle'}],now).length,1);
 assert.equal(discoverFlights([{...a,hex:'123abc',lat:39},a],now,{lat:38.947,lon:-77.46})[0].a.hex,a.hex);
});
test('airport board preserves uncertainty and never calls stale/future ground reports current',()=>{
 assert.equal(trafficBoard([{...a,ground:true}],new Map(),'IAD',now)[0].category,'ground');
 for(const observedAt of [now-31000,now+6000])assert.equal(trafficBoard([{...a,ground:true,observedAt}],new Map(),'IAD',now)[0].category,'other');
 assert.equal(trafficBoard([a],new Map(),'IAD',now)[0].category,'other');
 assert.equal(trafficBoard([{...a,lat:0}, {...a,lat:NaN}],new Map(),'IAD',now).length,0);
});
test('favorites sanitize malformed browser storage, deduplicate and bound collections',()=>{
 assert.deepEqual(sanitizeFavorites(null),{airports:[],airlines:[],aircraft:[]});
 const result=sanitizeFavorites({airports:['IAD','IAD','BAD'],airlines:['THY','THY','bad'],aircraft:[null,{hex:'ABCDEF',label:'a'.repeat(100)},{hex:'abcdef',label:'last'},{hex:'bad',label:'bad'}]});
 assert.deepEqual(result,{airports:['IAD'],airlines:['THY'],aircraft:[{hex:'abcdef',label:'last'}]});
 assert.equal(sanitizeFavorites({aircraft:Array.from({length:70},(_,i)=>({hex:i.toString(16).padStart(6,'0'),label:'a'}))}).aircraft.length,50);
});
test('history captures speed from each fix without backfilling missing measurements or duplicates',()=>{
 const p=appendTrail([],a);assert.equal(p[0].groundSpeed,200);assert.equal(appendTrail(p,{...a,groundSpeed:400}),p);
 const q=appendTrail(p,{...a,observedAt:now+10000,groundSpeed:null});assert.equal(q[0].groundSpeed,200);assert.equal(q[1].groundSpeed,null);
});
test('adaptive graphics require sustained slow frames, never upgrade or treat idle as slow',()=>{
 assert.equal(suggestedQuality('high',Array(59).fill(80)),null);assert.equal(suggestedQuality('high',Array(90).fill(16)),null);
 assert.equal(suggestedQuality('high',Array(90).fill(1000)),null);assert.equal(suggestedQuality('high',Array(90).fill(60)),'balanced');
 assert.equal(suggestedQuality('balanced',Array(90).fill(60)),'low');assert.equal(suggestedQuality('low',Array(90).fill(60)),null);
 assert.equal(lowerQuality('low','balanced'),'low');assert.equal(lowerQuality('high','balanced'),'balanced');
});
test('offline policy excludes live data, external tiles, model archives and query URLs',()=>{
 const context={URL};vm.runInNewContext(readFileSync(new URL('../public/offline-policy.js',import.meta.url),'utf8'),context);const p=context.skywardOfflinePolicy,o='http://localhost:8001';
 for(const url of ['/','/watch/','/watch/assets/index-abc.js','/watch/cesium/Cesium.js','/watch/data/atlas-v2.json'])assert.equal(p.eligible(url,o),true,url);
 for(const url of ['/airport-simulation/','/airport-simulation/index.wasm','/api/aircraft','/watch/api/aircraft','https://tiles.example.com/watch/data/a.json','/watch/models/test.glb','/watch/data/a.json?live=1'])assert.equal(p.eligible(url,o),false,url);
 assert.equal(p.maxBytes,40*1024*1024);assert.equal(p.maxEntries,100);
});
