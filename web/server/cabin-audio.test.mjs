import test from 'node:test';import assert from 'node:assert/strict';
import {cabinSoundProfile} from '../src/lib/cabinAudio.ts';
test('cabin ambience follows displayed touchdown, slows during taxi, and leaves only quiet cabin sound when parked',()=>{
 const air=cabinSoundProfile({ground:false,speed:150}),roll=cabinSoundProfile({ground:true,speed:130}),taxi=cabinSoundProfile({ground:true,speed:15}),park=cabinSoundProfile({ground:true,speed:0,phase:'parked'});
 assert.ok(roll.wind<air.wind/5);assert.ok(roll.rolling>taxi.rolling);assert.ok(taxi.rolling>0);assert.equal(park.rolling,0);assert.equal(park.wind,0);assert.ok(park.engine<taxi.engine);assert.ok(park.ventilation>0);assert.ok(roll.frequency<air.frequency+32);
 assert.deepEqual(cabinSoundProfile({ground:true,speed:NaN}),park);assert.deepEqual(cabinSoundProfile({ground:false,speed:150,phase:'parked'}),park);
});
