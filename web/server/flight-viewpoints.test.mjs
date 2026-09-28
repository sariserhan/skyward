import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraftViewpoint} from '../src/lib/flightViewpoints.ts';
import {sanitizeFlightPreferences} from '../src/lib/flightPreferences.ts';
import {validBackupValue} from '../src/lib/localBackup.ts';
test('pilot camera stays beyond the nose and rotates with the aircraft heading',()=>{
 for(const length of [9,22,40,74]){const north=aircraftViewpoint('pilot',length,0),east=aircraftViewpoint('pilot',length,90);assert.ok(north.north>length/2);assert.equal(north.east,0);assert.ok(Math.abs(east.east-north.north)<1e-9);assert.ok(Math.abs(east.north)<1e-9);assert.ok(north.up>0);assert.ok(north.pitch<0);}
});
test('cabin windows occupy opposite sides and face outward with finite fallback offsets',()=>{
 for(const heading of [0,90,180,359]){const left=aircraftViewpoint('cabin',40,heading,'left'),right=aircraftViewpoint('cabin',40,heading,'right');assert.ok(Math.abs(Math.hypot(left.east-right.east,left.north-right.north)-6.8)<1e-9);assert.ok(Math.abs(right.heading-left.heading-Math.PI)<1e-9);}
 assert.ok(Object.values(aircraftViewpoint('pilot',NaN,NaN)).every(Number.isFinite));
});
test('new follow views survive preferences and backup validation',()=>{
 for(const view of ['front','cockpit','cabin','bird']){const saved=sanitizeFlightPreferences({view});assert.equal(saved.view,view);assert.ok(validBackupValue('skyward.flight-view.v1',JSON.stringify(saved)));}
});

test('legacy pilot camera preferences migrate to front view',()=>{assert.equal(sanitizeFlightPreferences({view:'pilot'}).view,'front');});
