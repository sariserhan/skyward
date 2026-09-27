import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionConfidence} from '../src/lib/liveMotion.ts';
import {sanitizeFlightPreferences} from '../src/lib/flightPreferences.ts';
import {validBackupValue} from '../src/lib/localBackup.ts';
import {modelCoverage} from '../src/lib/modelCoverage.ts';
test('confidence ages and illustrative drift grows without claiming a calibrated error',()=>{
 const a={observedAt:1000,groundSpeed:400},recent=predictionConfidence(a,11000),old=predictionConfidence(a,200000);
 assert.equal(recent.level,'Recent estimate');assert.equal(old.level,'Low confidence');assert.ok(old.driftNm>recent.driftNm);assert.equal(predictionConfidence({...a,observedAt:null},200000).driftNm,null);
});
test('flight preferences reject invalid values and are accepted by scoped backups',()=>{
 const safe=sanitizeFlightPreferences({view:'route',distance:Infinity,sheet:-10,focus:true,compact:'yes'});assert.equal(safe.view,'side');assert.equal(safe.distance,1.15);assert.equal(safe.sheet,24);assert.equal(safe.compact,false);assert.equal(safe.focus,true);assert.ok(validBackupValue('skyward.flight-view.v1',JSON.stringify(safe)));assert.ok(!validBackupValue('skyward.flight-view.v1','{"view":"route"}'));
});
test('coverage deduplicates aircraft and ranks frequently seen approximation gaps first',()=>{
 const rows=modelCoverage([{hex:'1',aircraftType:'B38M',observedAt:1},{hex:'1',aircraftType:'B38M',observedAt:2},{hex:'2',aircraftType:'B38M'},{hex:'3',aircraftType:'ZZZZ'},{hex:'4',aircraftType:'A320'},{hex:'5',aircraftType:'ZZZZ',targetKind:'vehicle'}]);
 assert.deepEqual(rows.map(r=>[r.type,r.count,r.match]),[['B38M',2,'family'],['ZZZZ',1,'fallback'],['A320',1,'type']]);
});

