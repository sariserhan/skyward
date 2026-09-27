import test from 'node:test';
import assert from 'node:assert/strict';
import {retainMotion,MOTION_DELAY_MS,motionStatus} from '../src/lib/motionHistory.ts';
import {observedFrame} from '../src/lib/flightPresentation.ts';
const row=(i,time)=>({targetKind:'aircraft',hex:i.toString(16).padStart(6,'0'),lat:40,lon:time/10000000,altitude:30000,observedAt:time,ground:false,groundSpeed:450});
test('dense-area motion retains consecutive fixes beyond the 250-aircraft replay archive',()=>{
 const history=new Map();for(const time of [100000,135000])retainMotion(history,Array.from({length:800},(_,i)=>row(i,time)));
 assert.equal(history.size,800);for(const points of history.values()){assert.equal(points.length,2);assert.equal(observedFrame(points,150000-MOTION_DELAY_MS).interpolated,true);}
});
test('motion cache bounds points and aircraft while protecting selected and rejecting old fixes',()=>{
 const history=new Map();for(let time=1;time<=50;time++)retainMotion(history,[row(0,time)]);assert.equal(history.get('000000').length,32);
 retainMotion(history,[row(0,1)]);assert.equal(history.get('000000').at(-1).time,50);
 retainMotion(history,Array.from({length:10},(_,i)=>row(i+1,100)),'000000',5);assert.equal(history.size,5);assert.ok(history.has('000000'));
});
test('45-second buffer covers the normal 35-second feed interval without forecasting',()=>{
 const points=[row(0,100000),row(0,135000)].map(a=>({lon:a.lon,lat:a.lat,altitude:a.altitude,time:a.observedAt,ground:false}));
 assert.equal(observedFrame(points,174999-MOTION_DELAY_MS).interpolated,true);
 assert.deepEqual(observedFrame(points,220000-MOTION_DELAY_MS),{...points[1],interpolated:false});
 assert.match(motionStatus(points,220000),/held at last received fix/);assert.match(motionStatus(points.slice(0,1),150000),/Waiting for another/);
 assert.match(motionStatus(points,150000,true),/Reduced motion/);
});
