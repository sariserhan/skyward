import test from 'node:test';
import assert from 'node:assert/strict';
import {flightMilestones} from '../src/lib/flightMilestones.ts';
import {roughArrival,localAirportTime,destinationZone} from '../src/lib/destinationContext.ts';
import {parseCamera,encodeCamera} from '../src/lib/sharedCamera.ts';
const point=(time,altitude,ground=false)=>({time,altitude,ground,lat:0,lon:time/10000000,groundSpeed:200});
test('milestones require sustained continuous observations; gaps do not invent phases',()=>{
 const points=[point(0,0,true),point(30000,1000),point(60000,1600),point(90000,2200),point(300000,30000),point(330000,30000),point(360000,30000),point(390000,29000),point(420000,28000),point(900000,0,true)];
 const labels=flightMilestones(points).map(m=>m.label);
 assert.ok(labels.includes('Climb observed'));assert.ok(labels.includes('Descent observed'));assert.ok(labels.includes('Level at altitude · cruise inferred'));assert.equal(labels.filter(x=>x==='Reported on ground').length,2);
 assert.equal(flightMilestones([point(0,1000),point(300000,30000)]).some(m=>m.label==='Climb observed'),false);
 assert.deepEqual(flightMilestones([]),[]);
});
const now=1800000000000,a={callsign:'TEST',observedAt:now,lat:0,lon:0,ground:false,groundSpeed:400,heading:90};
const route={callsign:'TEST',status:'PLAUSIBLE',airports:[{lat:0,lon:-1},{lat:0,lon:10}]};
test('arrival estimate requires fresh plausible route and movement toward destination',()=>{
 assert.equal(roughArrival(a,route,now).minutes,90);
 for(const patch of [{groundSpeed:NaN},{heading:NaN},{lat:91},{ground:true},{heading:270},{groundSpeed:0},{observedAt:now-31000},{observedAt:now+6000},{positionWarning:'suspect'},{lat:null}])assert.equal(roughArrival({...a,...patch},route,now),null);
 assert.equal(roughArrival(a,{...route,callsign:'OTHER'},now),null);
 assert.equal(roughArrival(a,{...route,status:'UNVERIFIED'},now),null);
});
test('local airport clocks honor DST and reject unsupported zones or mismatched airports',()=>{
 assert.match(localAirportTime(Date.parse('2026-01-01T12:00:00Z'),'Europe/London'),/12:00/);
 assert.match(localAirportTime(Date.parse('2026-07-01T12:00:00Z'),'Europe/London'),/13:00/);
 assert.equal(localAirportTime(now,'invalid/zone'),null);
 assert.equal(destinationZone({icao:'EGLL',lat:0,lon:0}),null);
 assert.equal(destinationZone({icao:'EGLL',lat:51.47,lon:-.45}),'Europe/London');
});
test('shared camera round trips and rejects invalid or extreme URL values',()=>{
 const pose={lon:29,lat:41,height:10000,heading:1,pitch:-1,roll:0};assert.deepEqual(parseCamera(encodeCamera(pose)),pose);
 for(const bad of [null,'1,2','181,0,100,0,0,0','0,91,100,0,0,0','0,0,-1,0,0,0','0,0,Infinity,0,0,0','0,0,100,0,4,0','0,,100,0,0,0'])assert.equal(parseCamera(bad),null);
});
