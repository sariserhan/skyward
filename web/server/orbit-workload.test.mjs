import test from 'node:test';
import assert from 'node:assert/strict';
import {flightTrafficArea,areaKey} from '../src/lib/cameraTraffic.ts';
import {frameSummary} from '../src/lib/renderDiagnostics.ts';
test('watched flight retains polling window through small position changes',()=>{
 const initial=flightTrafficArea({lat:39,lon:-77},null);
 for(let i=0;i<100;i++)assert.equal(flightTrafficArea({lat:39+i*.001,lon:-77},initial),initial);
 assert.notEqual(areaKey(flightTrafficArea({lat:40,lon:-77},initial)),areaKey(initial));
 assert.equal(initial.radius,50);
 assert.equal(flightTrafficArea({lat:NaN,lon:0},initial),initial);
});
test('one and two second visible frame freezes remain measurable',()=>{
 const summary=frameSummary([16,16,1000,2000,NaN,0]);
 assert.equal(summary.maxFrameMs,2000);assert.equal(summary.p95,2000);assert.equal(summary.slowPercent,50);
});
