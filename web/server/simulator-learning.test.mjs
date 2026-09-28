import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initialFlight,stepFlight,chooseRunway,runwayStart,runwayHeading,movePoint,nauticalMiles} from '../src/lib/flightSimulator.ts';
import {trainingStart,initialLog,recordFlight,lessonResult,landingCue,copilotHelp} from '../src/lib/simulatorTraining.ts';
import {arrivalTaxi,stepTaxi,taxiDuration} from '../src/lib/simulatorTaxi.ts';
import {initialRadio,stepRadio} from '../src/lib/simulatorRadio.ts';
const airport=JSON.parse(readFileSync(new URL('../public/data/airports/IAD.json',import.meta.url)));const r=airport.runways[0];const p={from:'IAD',to:'IAD',departure:r,arrival:r,difficulty:'easy',aircraftType:'C172',challenge:'calm'};const neutral={pitch:0,roll:0,rudder:0};
test('Training starts and copilot guidance follow real simulator state',()=>{
 const first=trainingStart({...p,lesson:'takeoff'});assert.equal(first.ground,true);assert.equal(copilotHelp(first,p).target,'brakes');assert.equal(copilotHelp({...first,brakes:false},p).target,'throttle');
 assert.equal(trainingStart({...p,lesson:'pattern'}).assignedAltitude,1000);assert.match(copilotHelp({...first,phase:'rollout'},p).text,/apply brakes/);
 const wind=trainingStart({...p,lesson:'crosswind'});assert.equal(wind.ground,false);assert.equal(wind.nav,'final');assert.equal(wind.flaps,2);assert.ok(Math.abs(nauticalMiles(wind,runwayStart(r))-5)<.01);
 const glide=trainingStart({...p,lesson:'glide'});assert.equal(glide.fuelKg,0);assert.equal(glide.fuelExhausted,true);assert.equal(copilotHelp(glide,p).target,'pitch');assert.match(copilotHelp(glide,p).text,/Engines out/);
 const cue=landingCue({...wind,altitude:30,verticalSpeed:-200},p);assert.equal(cue.flare,true);assert.ok(Math.abs(cue.cross)<.1);
});
test('Takeoff callouts are once-only and do not fire during rollout or engines out',()=>{
 let s={...initialFlight(p),speed:30},radio=stepRadio(initialRadio(),s,p);assert.ok(radio.calls.some(c=>c.id==='coach-airspeed'));
 radio=stepRadio(radio,{...s,speed:56,elapsed:10},p);assert.ok(radio.calls.some(c=>c.id==='coach-rotate'));
 for(let t=11;t<15;t++)radio=stepRadio(radio,{...s,speed:56,elapsed:t},p);assert.equal(radio.calls.filter(c=>c.id==='coach-rotate').length,1);
 for(const patch of [{phase:'rollout'},{fuelExhausted:true}]){const r=stepRadio(initialRadio(),{...s,speed:70,...patch},p);assert.ok(!r.calls.some(c=>c.id==='coach-rotate'));}
});
test('Flight recorder bounds memory, preserves start, records touchdown and lesson outcome',()=>{
 const log=initialLog(),s=initialFlight(p);for(let t=0;t<12000;t+=2)recordFlight(log,{...s,elapsed:t,altitude:t/10,phase:'cruise'},p);assert.ok(log.samples.length<=1800);assert.equal(log.samples[0].time,0);assert.ok(log.interval>2);
 recordFlight(log,{...s,elapsed:12000,phase:'rollout',touchdownRate:-200},p);assert.ok(log.touchdown);assert.match(lessonResult({...p,lesson:'takeoff'},s,log),/complete/);assert.match(lessonResult({...p,lesson:'crosswind'},{...s,phase:'crashed'},log),/retry/);
});
test('Traffic pattern assistance flies all circuit legs and returns to a full stop',()=>{
 const plan={...p,lesson:'pattern'},legs=new Set();let s={...trainingStart(plan),autopilot:true};for(let i=0;i<4000&&!['landed','crashed'].includes(s.phase);i++){s=stepFlight(s,plan,neutral,1);legs.add(s.nav);}assert.equal(s.phase,'landed',s.warning);for(const leg of ['departure','intercept','align','base','final'])assert.ok(legs.has(leg),leg);
});
test('Taxi uses a connected mapped route without teleporting, parks, and shuts down',()=>{
 let taxi,plan,s;for(const runway of airport.runways){plan={...p,arrival:runway};s={...initialFlight(plan),...movePoint(runwayStart(runway),runwayHeading(runway),runway.length*.2/1852),heading:runwayHeading(runway),phase:'landed'};taxi=arrivalTaxi(s,plan,airport);if(taxi)break;}
 assert.ok(taxi,'IAD connected route');assert.ok(taxi.route.gate);assert.equal(taxi.route.points[0].lat,s.lat);
 const fuel=s.fuelKg;for(let t=0;t<taxiDuration(taxi)+5;t+=.1){const prev=s;s=stepTaxi(s,plan,taxi,.1);assert.ok(nauticalMiles(prev,s)*1852<1,'continuous taxi');assert.equal(s.altitude,0);}assert.equal(taxi.parked,true);assert.equal(s.speed,0);assert.ok(s.fuelKg<fuel);taxi.shutdown=true;const end=stepTaxi(s,plan,taxi,.1);assert.equal(end.fuelBurnKgHour,0);assert.equal(end.fuelKg,s.fuelKg);
 assert.equal(arrivalTaxi({...s,fuelExhausted:true},plan,airport),null);assert.equal(arrivalTaxi(s,plan,{...airport,paths:[]}),null);
});
