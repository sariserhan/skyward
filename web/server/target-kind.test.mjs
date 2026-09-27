import test from 'node:test';
import assert from 'node:assert/strict';
import {targetKind} from './target-kind.mjs';
import {normalizeAircraft} from './feed.mjs';
test('emitter categories distinguish vehicles and fixed objects without guessing from callsigns',()=>{
 assert.equal(targetKind('C1',''),'vehicle');assert.equal(targetKind('C2',''),'vehicle');
 assert.equal(targetKind('C3',''),'fixed');assert.equal(targetKind('C4',''),'fixed');assert.equal(targetKind('C5',''),'fixed');
 assert.equal(targetKind('A3',''),'aircraft');assert.equal(targetKind('B6',''),'aircraft');
 assert.equal(targetKind('A0',''),'unknown');assert.equal(targetKind('D7',''),'unknown');assert.equal(targetKind('', ''),'unknown');
 assert.equal(targetKind('','TWR'),'fixed');assert.equal(targetKind('','GRND'),'vehicle');
 assert.equal(normalizeAircraft({hex:'abcdef',flight:'TWR'},1000).targetKind,'unknown');
 assert.equal(normalizeAircraft({hex:'abcdef',category:'C2',alt_baro:'ground',lat:0,lon:0,seen_pos:0},1000).targetKind,'vehicle');
});
