import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecording,recordingBounds,sessionFrame} from '../src/lib/sessionRecording.ts';
import {densityCells} from '../src/lib/density.ts';
import {countryAt,localZone,observedDistance} from '../src/lib/passengerGeography.ts';
import {spotterCandidates} from '../src/lib/spotter.ts';
const point=(time,lon=0,lat=0)=>({lon,lat,altitude:10000,time,ground:false,groundSpeed:200});
const recording=()=>({format:'skyward-session',version:1,name:'Test',createdAt:1000,tracks:[{identity:{hex:'abcdef',callsign:'TEST1'},points:[point(1000,0),point(61000,.1),point(241000,3)]},{identity:{hex:'123abc',callsign:'TEST2'},points:[point(61000,4),point(90000,5)]}]});
test('session parser strips extra fields and rejects unsafe, unordered, duplicate or excessive data',()=>{
 const r=parseRecording(recording());assert.equal(r.tracks[0].identity.targetKind,'aircraft');assert.deepEqual(recordingBounds(r),{start:1000,end:241000,count:5});
 for(const change of [r=>r.version=2,r=>r.createdAt=1e30,r=>r.tracks[0].points[1].lat=91,r=>r.tracks[0].points[1].time=1000,r=>r.tracks[0].points[1].altitude=NaN,r=>r.tracks[1].identity.hex='abcdef',r=>r.tracks[0].points[1].groundSpeed=Infinity,r=>r.tracks[0].points[2].time=9999999]){const r=recording();change(r);assert.throws(()=>parseRecording(r));}
});
test('all-aircraft session replay neither shows future aircraft nor bridges gaps or extrapolates',()=>{
 const r=parseRecording(recording());assert.equal(sessionFrame(r,500).length,0);const middle=sessionFrame(r,31000);assert.equal(middle.length,1);assert.ok(Math.abs(middle[0].lon-.05)<1e-9);
 assert.equal(sessionFrame(r,150000).find(a=>a.hex==='abcdef').lon,.1);assert.equal(sessionFrame(r,220000).length,0);assert.equal(sessionFrame(r,241000)[0].lon,3);
});
test('density counts unique airborne aircraft per cell and excludes stale, future and ground fixes',()=>{
 const h=new Map([['a',[point(1000),point(2000),{...point(2000,2),ground:true},point(999999,5)]],['b',[point(2000,.01,.01)]]]);const cells=densityCells(h,3000);assert.equal(cells.length,1);assert.equal(cells[0].count,2);assert.equal(densityCells(h,3000000).length,0);
});
test('country lookup respects polygon holes and timezone selection stays in the mapped country',()=>{
 const countries=[{name:'A',code:'AA',polygons:[[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]]]}];assert.equal(countryAt(countries,2,2).name,'A');assert.equal(countryAt(countries,5,5),null);assert.equal(countryAt(countries,20,20),null);
 assert.equal(localZone([{country:'BB',zone:'B',lon:2,lat:2},{country:'AA',zone:'A',lon:3,lat:3}],2,2,'AA').zone,'A');
 assert.ok(observedDistance([point(1000),point(2000,.1),point(300000,3)]).km>10);assert.equal(observedDistance([point(1000),point(2000,.1),point(300000,3)]).gaps,1);
});
test('spotter needs fresh consistent approach fixes and excludes ground, vehicles and departures',()=>{
 const now=100000,a={hex:'abcdef',callsign:'TEST1',targetKind:'aircraft',lat:38.95,lon:-77.55,ground:false,observedAt:now};const points=[point(40000,-77.8,38.95),point(70000,-77.65,38.95),point(now,-77.55,38.95)];const h=new Map([[a.hex,points]]);
 assert.equal(spotterCandidates([a],h,'IAD',now).length,1);for(const x of [{...a,ground:true},{...a,targetKind:'vehicle'},{...a,observedAt:now-40000}])assert.equal(spotterCandidates([x],h,'IAD',now).length,0);
 assert.equal(spotterCandidates([a],new Map([[a.hex,points.slice(-2)]]),'IAD',now).length,0);
});
