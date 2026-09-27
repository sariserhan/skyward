import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraAreaPath,FeedClient} from './feed.mjs';
import {cameraArea,inCameraArea,mergeCameraAircraft,areaKey,trafficRegions,combineRegions} from '../src/lib/cameraTraffic.ts';
test('camera area validation rejects invalid, missing, out-of-range and oversized queries',()=>{
 for(const args of [[NaN,0,25],[91,0,25],[0,181,25],[0,0,251],[0,0,0],[0,0,1.5],['41',29,25]])assert.throws(()=>cameraAreaPath(...args));
 assert.equal(cameraAreaPath(41.04,28.96,100),'/v2/point/41/29/100');assert.equal(cameraAreaPath(0,0,25),'/v2/point/0/0/25');
});
test('camera footprint includes corner distance, quantization padding and explicit wide-view limit',()=>{
 const local=cameraArea({lat:41,lon:29},[{lat:41.2,lon:29.2}]);assert.ok(local.radius>=25&&!local.limited);
 const wide=cameraArea({lat:41,lon:29},[{lat:52,lon:45}]);assert.equal(wide.radius,250);assert.ok(wide.limited);
 const seam=cameraArea({lat:0,lon:179.95},[{lat:0,lon:-179.9}]);assert.ok(seam.radius<=25);assert.equal(cameraArea({lat:NaN,lon:0},[]),null);
 assert.equal(areaKey({...local,limited:true}),areaKey(local));
});
test('successful camera snapshots deduplicate old fixes without retaining disappeared or out-of-area targets',()=>{
 const area={lat:41,lon:29,radius:100,limited:false},a={hex:'abcdef',lat:41,lon:29,observedAt:2000};
 assert.equal(inCameraArea(a,area),true);assert.equal(inCameraArea({...a,lon:-77},area),false);
 assert.equal(mergeCameraAircraft([{...a,observedAt:1000}],[a],area)[0].observedAt,2000);assert.deepEqual(mergeCameraAircraft([], [a],area),[]);
 assert.deepEqual(mergeCameraAircraft([{...a,lon:0}],[],area),[]);assert.equal(mergeCameraAircraft([a,{...a,observedAt:1000}],[],area).length,1);
});
test('camera requests use canonical provider cache and share concurrent requests',async()=>{
 const calls=[];const feed=new FeedClient(async url=>{calls.push(url);return {ok:true,json:async()=>({now:Date.now()/1000,ac:[]})};});
 await Promise.all([feed.cameraArea(41.04,28.96,100),feed.cameraArea(41,29,100)]);assert.deepEqual(calls,['https://api.adsb.lol/v2/point/41/29/100']);
 await feed.cameraArea(41,29,100);assert.equal(calls.length,1);
});

test('regional footprint expands with bounded overlapping queries; never implies global completeness',()=>{
 const a=cameraArea({lat:41,lon:29},[{lat:41,lon:37},{lat:41,lon:21},{lat:47,lon:29},{lat:35,lon:29}]);
 assert.ok(a.limited);assert.ok(trafficRegions(a).length>1&&trafficRegions(a).length<=5);
 for(const r of trafficRegions(a))assert.ok(r.radius<=250&&Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180);
 assert.ok(inCameraArea({lat:41,lon:35.5},a));
 const globe=cameraArea({lat:0,lon:0},[{lat:70,lon:100}],true);assert.equal(trafficRegions(globe).length,1);assert.ok(globe.limited);
});
test('partial region failures preserve only failed-area fixes; successful empty regions remove stale targets',()=>{
 const left={lat:0,lon:0,radius:100},right={lat:0,lon:4,radius:100},area={...left,limited:true,regions:[left,right]};
 const a={hex:'aaa111',lat:0,lon:0,observedAt:1000},b={hex:'bbb222',lat:0,lon:4,observedAt:2000};
 assert.deepEqual(combineRegions([{region:left,rows:[]},{region:right,rows:null}],[a,b],area),[b]);
 assert.deepEqual(combineRegions([{region:left,rows:[]},{region:right,rows:[]}],[a,b],area),[]);
 const overlap={lat:0,lon:1,radius:100};
 assert.deepEqual(combineRegions([{region:left,rows:[]},{region:overlap,rows:null}],[a],{...area,regions:[left,overlap]}),[]);
});
