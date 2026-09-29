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

test('ASV706 known A321 resolves unspecified category without turning ground equipment into aircraft',async()=>{
 const {qualityRows}=await import('../src/lib/positionQuality.ts');
 const raw={hex:'71c073',flight:'ASV706',r:'HL8073',t:'A321',category:'A0',lat:35.550476,lon:140.019493,alt_baro:21975,gs:336.8,track:299.53,seen_pos:0};
 const row=normalizeAircraft(raw,1000);assert.equal(row.targetKind,'aircraft');assert.equal(row.category,'A0');
 const corrected=qualityRows([{...row,targetKind:'unknown'}],new Map(),1000)[0];assert.equal(corrected.targetKind,'aircraft');assert.equal(corrected.observedAt,row.observedAt);
 for(const type of ['A321','A21N','B38M','C750','DH8D'])assert.equal(targetKind('A0',type),'aircraft',type);
 assert.equal(targetKind('C2','A321'),'vehicle');assert.equal(targetKind('C3','A321'),'fixed');assert.equal(targetKind('A0','ZZZZ'),'unknown');
 assert.equal(qualityRows([{...row,targetKind:'vehicle'}],new Map(),1000)[0].targetKind,'vehicle');
});
