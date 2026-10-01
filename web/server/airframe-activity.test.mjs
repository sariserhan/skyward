import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyActivity,observeActivity} from '../src/lib/airframeActivity.ts';
const now=Date.now(),row={observedAt:now,registration:'N123AA',hex:'abcdef',lat:39,lon:-77,altitude:100,groundSpeed:0,ground:true};
const observe=(s,r)=>observeActivity(s,r,'Fixture',r.observedAt);
test('activity needs distinct repeated observations for a state transition',()=>{
 let s=observe(emptyActivity(),row);assert.deepEqual(s.events.map(e=>e.type),['FIRST_SEEN']);
 s=observe(s,{...row,observedAt:now+60000,ground:false});assert.equal(s.events.length,1);
 s=observe(s,{...row,observedAt:now+60000,ground:false});assert.equal(s.events.length,1);
 s=observe(s,{...row,observedAt:now+120000,ground:false});assert.equal(s.events.at(-1).type,'AIRBORNE');
 s=observe(s,{...row,observedAt:now+180000});s=observe(s,{...row,observedAt:now+240000,ground:false});assert.equal(s.events.length,2);
});
test('coverage gaps reset transitions and never fabricate a landing',()=>{
 let s=observe(emptyActivity(),{...row,ground:false});s=observe(s,{...row,observedAt:now+1800000});assert.deepEqual(s.events.map(e=>e.type),['FIRST_SEEN','REAPPEARED']);
 assert.equal(observeActivity(s,{...row,observedAt:now},'Fixture',now+2000000),s);
 assert.equal(observeActivity(emptyActivity(),row,'Fixture',now+121000).events.length,0);
});
test('identifier changes are recorded and event history is bounded',()=>{
 let s=observe(emptyActivity(),row);s=observe(s,{...row,observedAt:now+60000,registration:'N456AA',hex:'123456'});
 assert.deepEqual(s.events.map(e=>e.type),['FIRST_SEEN','REGISTRATION_CHANGED','ICAO_CHANGED']);
 for(let i=1;i<100;i++)s=observe(s,{...row,observedAt:now+i*1800000});assert.ok(s.events.length<=50);assert.ok(s.events.every(e=>s.last.observedAt-e.at<86400000));
});
