import test from 'node:test';
import assert from 'node:assert/strict';
import {flightAltitude} from '../src/lib/flightAltitude.ts';
test('Atlanta touchdown shows ground without changing its above-sea-level height',()=>{
 const a={ground:false,altitude:1600};const frame={ground:true,altitude:1026,arrivalElevationFt:1026,landingPhase:'parked'};
 assert.deepEqual(flightAltitude(a,frame),{onGround:true,altitude:1026,label:'0 ft above ground',elevation:1026});assert.equal(frame.altitude,1026);
 for(const phase of ['rollout','taxi','parked'])assert.equal(flightAltitude(a,{...frame,landingPhase:phase}).onGround,true);
 assert.equal(flightAltitude(a,{...frame,ground:false,landingPhase:'approach'}).onGround,false);
 assert.equal(flightAltitude(a,{...frame,groundClearance:30}).onGround,false);
 assert.equal(flightAltitude(a,{...frame,groundClearance:30}).altitude,1056);
});
test('reported ground and airborne readings retain their own reference',()=>{
 assert.equal(flightAltitude({ground:true,altitude:1026},null).onGround,true);
 assert.deepEqual(flightAltitude({ground:false,altitude:35000},null),{onGround:false,altitude:35000,label:'ft reported',elevation:null});
 assert.equal(flightAltitude({ground:false,altitude:null},null).altitude,null);
 assert.equal(flightAltitude({simulation:{},ground:false,altitude:800},{ground:true,altitude:1026,simulationElevationFt:1026}).elevation,1026);
});
test('climb instruments follow the rendered correction instead of showing a newer report',()=>{
 const a={ground:false,altitude:1000},frame={ground:false,altitude:740,correcting:true};
 assert.equal(flightAltitude(a,frame).altitude,740);assert.equal(flightAltitude(a,frame).label,'ft displayed');
 assert.equal(flightAltitude({...a,ground:true},frame).onGround,false);
});
