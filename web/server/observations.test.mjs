import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTrail, splitTrail, freshness, inferRunway } from '../src/lib/aircraft.ts';
const now = 1800000000000;
const plane = {hex:'abcdef',lat:0.005,lon:0,altitude:200,heading:0,observedAt:now,ground:false};
test('trails exclude unknown altitude and duplicate fixes and break across coverage gaps',()=>{
  const first=appendTrail([],plane);
  assert.equal(appendTrail(first,plane),first);
  assert.equal(appendTrail(first,{...plane,altitude:null}),first);
  const points=appendTrail(first,{...plane,observedAt:now+121000});
  assert.equal(splitTrail(points).length,2);
  assert.equal(freshness({...plane,observedAt:null},now),'Signal gap');
  assert.equal(freshness(plane,now+31000),'Last seen');
});
test('runway inference requires fresh low aligned positions and selects direction',()=>{
 const runways=[{id:'01/19',a:[0,0],b:[0,0.01],width:45,length:1113}];
 assert.equal(inferRunway(plane,runways,now),'01');
 assert.equal(inferRunway({...plane,heading:180},runways,now),'19');
 for(const change of [{heading:90},{lon:0.01},{altitude:10000},{observedAt:now-31000},{observedAt:null}]) assert.equal(inferRunway({...plane,...change},runways,now),null);
});
