import test from 'node:test';import assert from 'node:assert/strict';
import {initialFlight,commandFlight,stepFlight,runwayStart,runwayHeading,movePoint,nauticalMiles} from '../src/lib/flightSimulator.ts';
import {landingPractice} from '../src/lib/simulatorTraining.ts';
import {CLEAR_WEATHER,weatherAt} from '../src/lib/simulatorWeather.ts';
import {DEFAULT_CONTROLLER,readController,controllerAxis} from '../src/lib/simulatorGamepad.ts';
import {stepTaxi} from '../src/lib/simulatorTaxi.ts';
import {validateReplay,librarySummary} from './simulator-replay.mjs';
import {validateLibrary} from './account-library.mjs';
const runway={id:'01/19',a:[-77,38],b:[-77,38.03],length:3300,width:50},p={from:'IAD',to:'DCA',departure:runway,arrival:runway,difficulty:'advanced',aircraftType:'C172',challenge:'calm'},neutral={pitch:0,roll:0,rudder:0};
test('Cold start needs battery, fuel and idle throttle; stopping engine removes thrust without consuming fuel',()=>{
 let s=initialFlight({...p,coldStart:true});assert.equal(s.engineRunning,false);assert.equal(commandFlight(s,p,{engineRunning:true}).engineRunning,false);s=commandFlight(s,p,{battery:true});assert.equal(commandFlight({...s,throttle:1},p,{engineRunning:true}).engineRunning,false);s=commandFlight(s,p,{engineRunning:true});assert.equal(s.engineRunning,true);
 s=commandFlight({...s,throttle:1,brakes:false},p,{engineRunning:false});const next=stepFlight(s,p,neutral,2);assert.equal(next.speed,0);assert.equal(next.fuelKg,s.fuelKg);assert.equal(commandFlight({...s,fuelKg:0},p,{engineRunning:true}).engineRunning,false);
 const flying={...initialFlight(p),ground:false,phase:'cruise',altitude:3000,speed:80,engineRunning:false};assert.ok(stepFlight(flying,p,neutral,2).altitude<3000);
});
test('Weather drift, turbulence and wet braking change handling deterministically',()=>{
 assert.equal(weatherAt({...CLEAR_WEATHER,wind:10,direction:270},0,0).direction,90);
 const s={...initialFlight(p),ground:false,phase:'cruise',altitude:3000,speed:100,throttle:.5};const calm=stepFlight(s,p,neutral,2),wind=stepFlight(s,{...p,weather:{...CLEAR_WEATHER,wind:30,turbulence:1}},neutral,2);assert.ok(nauticalMiles(calm,wind)>.005);assert.notEqual(calm.bank,wind.bank);
 const roll={...initialFlight(p),phase:'rollout',speed:40,brakes:true};assert.ok(stepFlight(roll,{...p,weather:{...CLEAR_WEATHER,rain:1}},neutral,1).speed>stepFlight(roll,p,neutral,1).speed);
});
test('Landing reset restores a fresh final approach, with engine-out lesson preserved',()=>{
 const s=landingPractice({...p,coldStart:true,fuelPercent:0});assert.equal(s.ground,false);assert.equal(s.engineRunning,true);assert.ok(s.fuelKg>0);assert.equal(s.elapsed,0);assert.ok(Math.abs(nauticalMiles(s,runwayStart(runway))-5)<.01);assert.equal(s.gearPosition,1);assert.equal(landingPractice({...p,lesson:'glide'}).engineRunning,false);
});
test('Controller dead zone, sensitivity, inversion and button edges do not repeat held actions',()=>{
 assert.equal(controllerAxis(.05,.12,1),0);assert.equal(controllerAxis(1,.12,2),1);
 const pad={axes:[.5,.5,-.5,-1],buttons:[{pressed:true},{pressed:false}]},settings={...DEFAULT_CONTROLLER,throttle:3,invertPitch:true};const first=readController(pad,settings,new Set());assert.ok(first.input.pitch<0);assert.ok(first.input.roll>0);assert.equal(first.throttle,1);assert.equal(first.brakes,true);assert.equal(readController(pad,settings,first.pressed).brakes,false);assert.equal(readController({axes:[],buttons:[]},settings,new Set()).throttle,0);
});
test('Manual taxi responds to rudder, respects brakes, stays on the ground and parks only near the assigned stand',()=>{
 const start=runwayStart(runway),end=movePoint(start,0,.1),route={points:[start,end],stop:start,meters:[0,185.2],length:185.2,gate:'A1'},taxi={route,time:0,manual:true,parked:false,shutdown:false};let s={...initialFlight(p),...start,heading:0,phase:'landed',brakes:false,throttle:.4};for(let i=0;i<100;i++)s=stepTaxi(s,p,taxi,.1,{pitch:1,roll:0,rudder:1});assert.notEqual(s.heading,0);assert.equal(s.altitude,0);assert.equal(s.pitch,0);assert.equal(taxi.parked,false);
 const parked=stepTaxi({...s,...end,speed:0,brakes:true,throttle:0},p,taxi,.1);assert.equal(taxi.parked,true);assert.equal(parked.speed,0);
});
test('Replay validation bounds storage, rejects bad coordinates/order, and summaries omit payloads',()=>{
 const sample={time:0,lat:38,lon:-77,altitude:0,speed:0,fuel:100,phase:'ready',warning:''},replay={samples:[sample],events:[],interval:2,maxAltitude:0};assert.equal(validateReplay(replay).samples.length,1);
 for(const bad of [{...replay,samples:[{...sample,lat:NaN}]},{...replay,samples:[{...sample,time:2},sample]},{...replay,samples:Array(1801).fill(sample)},{...replay,events:Array(101).fill({time:0,text:''})}])assert.throws(()=>validateReplay(bad));
 const saved=validateLibrary('missions',{from:'IAD',to:'DCA',difficulty:'easy',result:'aborted',duration:10,touchdownRate:0,replay});assert.equal(saved.replay,undefined);const summary=librarySummary('missions',saved);assert.equal(summary.hasReplay,false);assert.equal(summary.replay,undefined);
});
test('Long unattended flight remains finite and time-step variation does not break engine or fuel state',()=>{
 let s={...initialFlight(p),ground:false,phase:'cruise',altitude:50000,speed:110,throttle:.5};for(let i=0;i<24000&&!['crashed','landed'].includes(s.phase);i++){s=stepFlight(s,p,neutral,i%2?.05:.25);for(const k of ['lat','lon','speed','pitch','bank','fuelKg'])assert.ok(Number.isFinite(s[k]),k);}assert.ok(s.fuelKg>=0);assert.ok(s.elapsed>3599);
});
