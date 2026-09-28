import test from 'node:test';
import assert from 'node:assert/strict';
import {practicePose,stepPractice,cockpitControls} from '../src/lib/cockpit.ts';
import {aircraftViewpoint} from '../src/lib/flightViewpoints.ts';
const a={lat:40,lon:179.999,altitude:12000,heading:90,groundSpeed:300};
test('front camera preserves the old unobstructed pilot-camera pose',()=>{assert.deepEqual(aircraftViewpoint('front',40,90),aircraftViewpoint('pilot',40,90));});
test('cockpit practice inputs change only the local pose and remain bounded across the dateline',()=>{const snapshot=structuredClone(a);let p=practicePose(a);for(let i=0;i<600;i++)p=stepPractice(p,{...cockpitControls,roll:.6,pitch:.5,throttle:1},.1);assert.ok(p.heading!==90);assert.ok(p.altitude>12000);assert.ok(p.speed>300);assert.ok(Math.abs(p.lon)<=180&&Math.abs(p.lat)<=90);assert.deepEqual(a,snapshot);assert.ok(p.bank<=35&&p.pitch<=15);});
test('pause freezes practice, level hold eases bank and pitch, and terrain bounds descent',()=>{const p={...practicePose(a),bank:30,pitch:12};assert.deepEqual(stepPractice(p,{...cockpitControls,paused:true},.1),p);const level=stepPractice(p,{...cockpitControls,level:true},.1);assert.ok(level.bank<30&&level.pitch<12);let low={...p,altitude:3,pitch:-15};for(let i=0;i<100;i++)low=stepPractice(low,{...cockpitControls,pitch:-1},.1,1000);assert.ok(low.altitude>=1008);});
test('gear and flaps add drag to the illustrative practice response',()=>{let clean=practicePose(a),drag=practicePose(a);for(let i=0;i<100;i++){clean=stepPractice(clean,cockpitControls,.1);drag=stepPractice(drag,{...cockpitControls,gear:true,flaps:1},.1);}assert.ok(drag.speed<clean.speed);});
