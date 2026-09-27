import test from 'node:test';
import assert from 'node:assert/strict';
import {recordActivity,activityWindow,movement,nearestAirports,sanitizeCollections,airportPoints} from '../src/lib/exploration.ts';
import {matchesTraffic} from '../src/lib/experience.ts';
import {AIRPORTS} from '../src/lib/airportCatalog.ts';
const now=1800000000000,home=AIRPORTS.IAD;
const a={hex:'abcdef',callsign:'TEST1',targetKind:'aircraft',lat:home.lat,lon:home.lon,altitude:3000,ground:false,observedAt:now};
test('activity counts distinct fresh targets, keeps classes separate and ignores repeated source payloads',()=>{
 let bins=recordActivity([], [a,a,{...a,hex:'123abc',targetKind:'vehicle'},{...a,hex:'456abc',observedAt:now-60000},{...a,hex:'111abc',lat:0,lon:0}], 'IAD',now);
 assert.equal(Object.keys(bins[0].ids).length,2);assert.equal(bins[0].ids['123abc'],'vehicle');
 assert.equal(recordActivity(bins,[a],'IAD',now),bins);
 bins=recordActivity(bins,[{...a,observedAt:now+10000}],'IAD',now+10000);assert.equal(Object.keys(bins[0].ids).length,2);assert.equal(bins[0].samples,2);
});
test('activity gaps remain missing while a successful empty sample is a real observed zero',()=>{
 const bins=recordActivity([],[],'IAD',now);
 const view=activityWindow(bins,now+120000,3);
 assert.ok(view[0].bin);assert.equal(Object.keys(view[0].bin.ids).length,0);assert.equal(view[1].bin,null);assert.equal(view[2].bin,null);
 assert.equal(activityWindow([],now).filter(x=>x.bin).length,0);
 let bounded=[];for(let i=0;i<150;i++)bounded=recordActivity(bounded,[],'IAD',now+i*60000);assert.equal(bounded.length,120);
});
const trail=[{lat:home.lat,lon:home.lon-.13,altitude:3500,time:now-50000,ground:false},{lat:home.lat,lon:home.lon-.10,altitude:3300,time:now-25000,ground:false},{lat:home.lat,lon:home.lon-.07,altitude:3000,time:now,ground:false}];
test('movement needs three fresh contiguous fixes and a consistent radial trend',()=>{
 assert.equal(movement(a,trail,'IAD',now).direction,'Approaching');
 const outward=trail.map((p,i)=>({...p,lon:trail[2-i].lon}));assert.equal(movement(a,outward,'IAD',now).direction,'Moving away');
 assert.equal(movement(a,trail.slice(1),'IAD',now),null);
 assert.equal(movement(a,trail,'IAD',now+31000),null);
 assert.equal(movement({...a,targetKind:'vehicle'},trail,'IAD',now),null);
 assert.equal(movement({...a,targetKind:'fixed'},trail,'IAD',now),null);
 assert.equal(movement({...a,ground:true},trail,'IAD',now),null);
 assert.equal(movement(a,[{...trail[0],time:now-170000},...trail.slice(1)],'IAD',now),null);
 assert.equal(movement(a,[trail[0],{...trail[1],lon:home.lon-.04},trail[2]],'IAD',now),null);
});
test('nearby airports are distance-sorted, exclude home and remain catalog entries',()=>{
 const airports=nearestAirports('LHR');assert.equal(airports.length,8);assert.ok(airports.every(a=>a.code!=='LHR'&&AIRPORTS[a.code]));
 assert.ok(airports.slice(1).every((a,i)=>a.distance>=airports[i].distance));assert.equal(nearestAirports('INVALID').length,0);
});
test('collections reject malformed stored data, duplicate IDs and non-catalog airport identifiers',()=>{
 assert.deepEqual(sanitizeCollections(null),[]);
 const groups=sanitizeCollections([{id:'a',name:' Trip ',airports:['IAD','LHR','IAD','constructor','../IST']},{id:'a',name:'Duplicate',airports:['IST']},{id:'x',name:7,airports:[]}]);
 assert.deepEqual(groups,[{id:'a',name:'Trip',airports:['IAD','LHR']}]);
 assert.equal(sanitizeCollections(Array.from({length:30},(_,i)=>({id:String(i),name:'Trip',airports:[]}))).length,20);
});
test('overview includes every runway endpoint and mapped terminal/gate including dateline coordinates',()=>{
 const g={runways:[{a:[179.9,0],b:[-179.9,0]}],surfaces:[{kind:'terminal',points:[[179.8,0],[179.8,.1],[179.9,.1]]}],gates:[{position:[179.85,.05]}]};
 assert.equal(airportPoints(g).length,6);assert.deepEqual(airportPoints(g)[1],[-179.9,0]);
});
test('target filters never treat identified fixed objects or vehicles as airborne aircraft',()=>{
 assert.ok(matchesTraffic({...a,targetKind:'vehicle'},'vehicles'));assert.ok(matchesTraffic({...a,targetKind:'fixed'},'fixed'));
 assert.ok(!matchesTraffic({...a,targetKind:'fixed'},'airborne'));assert.ok(!matchesTraffic({...a,targetKind:'vehicle'},'low'));
 assert.ok(matchesTraffic({...a,targetKind:undefined},'unknown'));assert.ok(!matchesTraffic({...a,targetKind:undefined},'aircraft'));
});
