import test from 'node:test';import assert from 'node:assert/strict';
import {sceneryAhead} from '../src/lib/sceneryAhead.ts';
import {normalizeMusicPreferences} from '../src/lib/musicPreferences.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
test('scenery corridor wraps the date line and respects heading and speed budgets',()=>{
 const p=sceneryAhead(179.99,0,90,600);assert.equal(p.length,3);assert.ok(p[1].lon<0);assert.ok(Math.abs(trackDistance(p[0],p[2])-15)<.1);
 assert.deepEqual(sceneryAhead(0,0,null,500),[{lon:0,lat:0}]);assert.deepEqual(sceneryAhead(NaN,0,90,500),[]);
 assert.ok(sceneryAhead(0,89.999,0,9000).every(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90));
 assert.ok(trackDistance(...[sceneryAhead(0,0,90,9000)[0],sceneryAhead(0,0,90,9000)[2]])<18);
});
test('music preferences sanitize corrupt storage and bound local favorites',()=>{
 assert.deepEqual(normalizeMusicPreferences(null),{volume:.4,loop:true,selected:'',favorites:[]});
 assert.deepEqual(normalizeMusicPreferences({volume:4,loop:false,selected:9,favorites:['rain','rain',null,'']}),{volume:1,loop:false,selected:'',favorites:['rain']});
 assert.equal(normalizeMusicPreferences({volume:NaN}).volume,.4);assert.equal(normalizeMusicPreferences({favorites:Array.from({length:200},(_,i)=>String(i))}).favorites.length,100);
});
