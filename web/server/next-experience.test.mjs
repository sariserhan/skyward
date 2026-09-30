import test from 'node:test';
import assert from 'node:assert/strict';
import {AircraftAnimation} from '../src/lib/aircraftAnimation.ts';
import {directTower} from '../src/lib/towerDirector.ts';
import {radarAltitudeMatch,radarBearing} from '../src/lib/towerRadar.ts';
import {problemSnapshot,recordFeedTiming} from '../src/lib/problemSnapshot.ts';
test('director prioritizes arrivals, retains approach through outage, switches after rollout',()=>{
 const candidates=[{hex:'dep',kind:'departure'},{hex:'arr',kind:'arrival'}];
 const first=directTower({target:'',since:0,completed:[]},candidates,1000,false);assert.equal(first.target,'arr');
 assert.equal(directTower(first,[],500000,false,true),first);
 const next=directTower(first,candidates,501000,true);assert.equal(next.target,'dep');assert.deepEqual(next.completed,['arr']);
 assert.equal(directTower(next,[],800000,true).target,'');
 assert.equal(directTower({target:'x',since:0,completed:Array.from({length:20},(_,i)=>String(i))},[],999999,true).completed.length,20);
});
test('radar altitude bands are inclusive and never assign an unknown altitude',()=>{
 assert.equal(radarAltitudeMatch(11000,10000,1000),true);assert.equal(radarAltitudeMatch(11001,10000,1000),false);assert.equal(radarAltitudeMatch(null,10000,1000),false);assert.equal(radarAltitudeMatch(20000,null,1000),true);
 assert.ok(Math.abs(radarBearing({lat:0,lon:0},{lat:0,lon:1},90))<.01);
});
test('aircraft banks smoothly across heading wrap, respects reduced motion and configures approach',()=>{
 const animation=new AircraftAnimation(),key={};const base={heading:359,ground:false,groundSpeed:200,altitude:5000,turnRate:0};animation.sample(key,base,0);
 const turned=animation.sample(key,{...base,heading:1},1000);assert.ok(turned.bank>0&&turned.bank<25);
 assert.equal(animation.sample(key,base,2000,true).bank,0);
 const approach=animation.sample(key,{...base,landingPhase:'approach'},3000);assert.equal(approach.gear,0);assert.equal(approach.flaps,.7);
 animation.sample(key,{...base,ground:true},4000);assert.equal(animation.sample(key,base,4100).gear,1);assert.equal(animation.sample(key,base,13000).gear,0);
});
test('snapshot history is bounded and uses an explicit privacy whitelist',()=>{
 globalThis.devicePixelRatio=2;
 const viewer={secret:'private',camera:{positionCartographic:{latitude:0,longitude:0,height:100},heading:0,pitch:0,roll:0},canvas:{clientWidth:100,clientHeight:200},scene:{mode:3,primitives:{length:2}},entities:{values:[]},dataSources:{length:1}};
 for(let i=0;i<50;i++)recordFeedTiming(viewer,i%2===0,i,i);
 const snapshot=problemSnapshot(viewer,'low',null);assert.equal(snapshot.feedTimings.length,30);assert.equal(snapshot.feedTimings[0].capturedAt,20);assert.equal(snapshot.format,'skyward-problem-snapshot');assert.ok(!JSON.stringify(snapshot).includes('private'));
});
