import {terrariumHeight} from '../src/lib/openTerrain.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseView,matchesTraffic,observeAlerts,modelFamily} from '../src/lib/experience.ts';
const now=1800000000000,a={hex:'abcdef',callsign:'TEST',registration:'',aircraftType:'A320',lat:38.94,lon:-77.46,ground:true,altitude:0,observedAt:now};
test('share links accept only supported views and valid aircraft/facility IDs',()=>{
 assert.deepEqual(parseView('#airport=IST&mode=2D&aircraft=ABCDEF&facility=facility-IST-3'),{airport:'IST',mode:'2D',aircraft:'abcdef',facility:'facility-IST-3',hasView:true});
 const x=parseView('#airport=OTHER&aircraft=<script>&facility=facility-IST-3&mode=bad');assert.equal(x.aircraft,'');assert.equal(x.facility,'');assert.equal(x.mode,'3D');assert.equal(x.airport,'IAD');
});
test('traffic bands handle ground, zero altitude and unknown altitude without fabricating height',()=>{
 assert.ok(matchesTraffic(a,'ground'));assert.ok(!matchesTraffic(a,'low'));
 assert.ok(matchesTraffic({...a,ground:false,altitude:0},'low'));
 assert.ok(matchesTraffic({...a,ground:false,altitude:10000},'high'));
 assert.ok(!matchesTraffic({...a,ground:false,altitude:null},'low'));
});
test('alerts require new contiguous fixes and never call a first observation a takeoff',()=>{
 let r=observeAlerts(undefined,a,now);assert.equal(r.events.length,0);
 const flight={...a,ground:false,altitude:500,observedAt:now+20000};
 let next=observeAlerts(r.state,flight,now+20000);assert.match(next.events[0].title,/reported airborne/);
 assert.equal(observeAlerts(next.state,flight,now+21000).events.length,0);
 assert.equal(observeAlerts(r.state,{...flight,observedAt:now+180000},now+180000).events.length,0);
});
test('coverage gap fires once and recovery requires a fresh fix',()=>{
 const base=observeAlerts(undefined,a,now).state;
 const gap=observeAlerts(base,a,now+121000);assert.equal(gap.events.length,1);
 assert.equal(observeAlerts(gap.state,a,now+130000).events.length,0);
 const resumed=observeAlerts(gap.state,{...a,observedAt:now+140000},now+140000);assert.match(resumed.events[0].title,/received again/);
});
test('airport proximity is an observation, not an arrival, and stale fixes do not trigger it',()=>{
 const outside={...a,lon:-77.7,ground:false};const base=observeAlerts(undefined,outside,now).state;
 const near={...a,ground:false,observedAt:now+20000};
 assert.match(observeAlerts(base,near,now+20000).events[0].title,/arrival unconfirmed/);
 assert.equal(observeAlerts(base,near,now+100000).events.length,0);
});
test('unknown aircraft types retain a generic model',()=>{
 assert.equal(modelFamily('B77W'),'widebody');assert.equal(modelFamily('A320'),'narrowbody');assert.equal(modelFamily('A388'),'jumbo');assert.equal(modelFamily('C172'),'generic');
});
test('out-of-order observations never reverse the alert baseline',()=>{
 const latest={...a,observedAt:now+50000};const state=observeAlerts(undefined,latest,now+50000).state;
 const r=observeAlerts(state,{...a,ground:false,observedAt:now+10000},now+50000);
 assert.equal(r.state.last.observedAt,now+50000);assert.equal(r.events.length,0);
});

test('open elevation decodes the published Terrarium offset and fractional metres',()=>{
 assert.equal(terrariumHeight(128,0,0),0);assert.equal(terrariumHeight(128,100,128),100.5);assert.equal(terrariumHeight(127,255,0),-1);
});
