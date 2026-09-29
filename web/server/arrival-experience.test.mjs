import test from 'node:test';
import assert from 'node:assert/strict';
import {directedView,journeyPhase,gearLayout,detailBudget} from '../src/lib/arrivalExperience.ts';
import {runwayMarkings,approachLightPoints} from '../src/lib/runwayDetails.ts';
import {aircraftViewpoint} from '../src/lib/flightViewpoints.ts';
import {sanitizeFlightPreferences} from '../src/lib/flightPreferences.ts';
import {LiveMotion} from '../src/lib/liveMotion.ts';
test('director changes cameras by phase and timeline keeps predictions distinct',()=>{
 assert.equal(directedView('approach'),'chase');assert.equal(directedView('rollout'),'side');assert.equal(directedView('taxi'),'bird');
 assert.match(journeyPhase({}, {landingPhase:'rollout'},[]).basis,/Predicted/);assert.equal(journeyPhase({ground:true,groundSpeed:5},null,[]).basis,'Reported ground state');
});
test('wing sides oppose each other and tail camera stays behind; saved presets are bounded',()=>{
 const left=aircraftViewpoint('wing',40,0,'left'),right=aircraftViewpoint('wing',40,0,'right');assert.ok(left.east<0&&right.east>0);assert.ok(aircraftViewpoint('tail',40,0).north<0);
 const p=sanitizeFlightPreferences({savedView:'wing',savedSide:'right',savedDistance:900});assert.equal(p.savedView,'wing');assert.equal(p.savedDistance,2.4);assert.equal(sanitizeFlightPreferences({savedView:'bad'}).savedView,'side');
});
test('runway markings and approach lights stay finite across the dateline',()=>{
 const r={a:[179.99,0],b:[-179.98,0],length:3300,width:45};const lines=runwayMarkings(r);assert.ok(lines.length>20);assert.ok(lines.flat(2).every(Number.isFinite));assert.ok(approachLightPoints(r).every(p=>Math.abs(p.lon)<=180));assert.deepEqual(runwayMarkings({...r,width:NaN}),[]);
});
test('gear family layouts vary and renderer budgets shrink under frame pressure',()=>{
 assert.equal(gearLayout('B77W').axles,3);assert.equal(gearLayout('A359').axles,2);assert.equal(gearLayout('B738').axles,1);assert.equal(gearLayout('C750').paired,false);assert.ok(detailBudget('high',60)<detailBudget('high',16));
});
test('returning ground observations settle vertically instead of snapping from an approach',()=>{
 const motion=new LiveMotion(),a={hex:'abcdef',targetKind:'aircraft',lat:0,lon:0,altitude:500,heading:90,groundSpeed:140,verticalRate:-500,ground:false,observedAt:100000};motion.sample(a,[],100000);
 const ground={...a,ground:true,altitude:0,groundSpeed:40,observedAt:101000};const start=motion.sample(ground,[],101000,false,null,{elevationFt:300,runways:[]});assert.ok(start.groundClearance>=190&&start.groundClearance<=200);
 let previous=start.groundClearance;for(let now=101100;now<=117000;now+=100){const next=motion.sample(ground,[],now,false,null,{elevationFt:300,runways:[]}).groundClearance;assert.ok(next<=previous&&previous-next<=2.1);previous=next;}assert.equal(previous,0);
});
