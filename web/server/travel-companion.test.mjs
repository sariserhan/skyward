import test from 'node:test';import assert from 'node:assert/strict';
import {travelCompanion,observedMilestones} from './travel-companion.mjs';
import {mergeTravelMoments} from '../src/lib/travelRecap.ts';
import {representativeWindowSeat} from '../src/lib/seatPosition.ts';
test('Arrival companion excludes stale or demo details and off-route progress',()=>{
 const now=Date.now(),j={from:'IAD',to:'IST',details:{mode:'live',status:'MATCHED_DATED_FLIGHT',fetchedAt:now,flight:{status:'landed',arrival:{estimatedAt:now+600000}}}};
 const c=travelCompanion(j,{lat:38.947,lon:-77.46,ground:true},now);assert.equal(c.progress,0);assert.equal(c.nearOrigin,true);assert.equal(c.destinationTimeZone,'Europe/Istanbul');assert.equal(c.arrivalEstimate,now+600000);
 assert.equal(travelCompanion({...j,details:{...j.details,mode:'demo'}},null,now).arrivalEstimate,null);assert.equal(travelCompanion(j,null,now+900001).arrivalStatus,null);assert.equal(travelCompanion(j,{lat:-80,lon:100},now).progress,null);
});
test('Milestones require adjacent observed transitions near the appropriate airport; snapshots and gaps do not imply landing',()=>{
 const base={observedAt:1000,ground:false,nearDestination:true};assert.deepEqual(observedMilestones(null,base,1000),[]);
 assert.equal(observedMilestones(base,{...base,observedAt:2000,ground:true},2000)[0].kind,'landing');assert.deepEqual(observedMilestones(base,{...base,observedAt:2000,ground:true,nearDestination:false},2000),[]);
 assert.deepEqual(observedMilestones(base,{...base,observedAt:200000,ground:true},200000),[]);assert.equal(observedMilestones({ground:true,nearOrigin:true,observedAt:1000},{ground:false,observedAt:2000},2000)[0].kind,'departure');
 assert.equal(observedMilestones(null,{arrivalStatus:'landed'},2000)[0].source,'reported');
});
test('Seat reference supports only the audited window columns and recap remains bounded and source-labelled',()=>{
 assert.deepEqual(representativeWindowSeat('14A'),{side:'left',position:'wing'});assert.deepEqual(representativeWindowSeat('30F'),{side:'right',position:'rear'});for(const s of ['31A','14B','0A','99F'])assert.equal(representativeWindowSeat(s),null);
 const moments=Array.from({length:30},(_,time)=>({kind:'scenery',source:'simulated',label:'User marked',time}));const rows=mergeTravelMoments([],moments);assert.equal(rows.length,24);assert.equal(mergeTravelMoments(rows,moments).length,24);assert.ok(rows.every(m=>m.source==='simulated'));
});
