import test from 'node:test';import assert from 'node:assert/strict';
import {initialRadio,stepRadio} from '../src/lib/simulatorRadio.ts';
import {initialFlight,movePoint,runwayStart,runwayHeading} from '../src/lib/flightSimulator.ts';
const runway={id:'01/19',a:[-77,38],b:[-77,38.03],length:3300,width:50};
const p={from:'AAA',to:'BBB',departure:runway,arrival:runway,aircraftType:'B738',difficulty:'advanced',challenge:'calm'};
test('Radio clears takeoff, reminds assigned altitude without frame spam, and warns of unstable landing',()=>{
 let s=initialFlight(p),r=stepRadio(initialRadio(),s,p);assert.match(r.calls.at(-1).text,/simulated takeoff/);assert.equal(stepRadio(r,s,p).calls.length,1);
 s={...s,ground:false,phase:'climb',altitude:2000,elapsed:30};r=stepRadio(r,s,p);assert.match(r.calls.at(-1).text,/Positive climb/);
 r=stepRadio(r,{...s,elapsed:60},p);assert.ok(r.calls.some(c=>/climb to 3000/.test(c.text)));const count=r.calls.length;assert.equal(stepRadio(r,{...s,elapsed:61},p).calls.length,count);
 r=stepRadio(r,{...s,altitude:4000,elapsed:90},p);assert.ok(r.calls.some(c=>/descend to 3000/.test(c.text)));
 s={...s,...movePoint(runwayStart(runway),runwayHeading(runway)+180,1),heading:0,phase:'approach',altitude:300,elapsed:100,speed:220,gearPosition:0};r=stepRadio(r,s,p);r=stepRadio(r,{...s,elapsed:121},p);assert.match(r.calls.at(-1).text,/Go around/);
});
test('Height callouts happen once per approach and radio history remains bounded',()=>{
 let s={...initialFlight(p),phase:'landing',ground:false,verticalSpeed:-200,altitude:100,elapsed:10},r=stepRadio(initialRadio(),s,p);assert.ok(r.calls.some(c=>c.id==='height-100'));
 r=stepRadio(r,{...s,elapsed:11},p);assert.equal(r.calls.filter(c=>c.id==='height-100').length,1);
 for(let i=1;i<40;i++)r=stepRadio(r,{...s,phase:'cruise',altitude:3000,elapsed:i*40},p);assert.ok(r.calls.length<=8);
});
test('Fuel failure cancels altitude-climb reminders and announces the emergency once',()=>{
 const s={...initialFlight(p),ground:false,phase:'cruise',altitude:2000,elapsed:40,fuelKg:0,fuelExhausted:true};let r=stepRadio(initialRadio(),s,p);assert.match(r.calls.at(-1).text,/Engines out/);r=stepRadio(r,{...s,elapsed:100},p);assert.equal(r.calls.filter(c=>c.id==='fuel-empty').length,1);assert.ok(!r.calls.some(c=>c.id.startsWith('altitude')));
});
test('Runway idle reminders explain brakes and throttle with cooldown and departure-only guards',()=>{
 const s=initialFlight(p);let r=stepRadio(initialRadio(),s,p);
 r=stepRadio(r,{...s,elapsed:11},p);assert.ok(!r.calls.some(c=>c.id.startsWith('runway-idle')));
 r=stepRadio(r,{...s,elapsed:12},p);assert.match(r.calls.at(-1).text,/Release brakes button or press B/);
 const count=r.calls.length;r=stepRadio(r,{...s,elapsed:13},p);assert.equal(r.calls.length,count);
 r=stepRadio(r,{...s,brakes:false,elapsed:42},p);assert.match(r.calls.at(-1).text,/Brakes are released.*increase throttle/);
 r=stepRadio(r,{...s,speed:5,elapsed:43},p);assert.equal(r.idleSince,null);
 r=stepRadio(r,{...s,elapsed:80},p);assert.equal(r.idleSince,80);assert.equal(r.lastIdleReminder,42);
 for(const patch of [{phase:'rollout'},{phase:'landed'},{phase:'crashed'},{ground:false,phase:'climb'},{fuelExhausted:true},{autopilot:true}]){
  let quiet=stepRadio(initialRadio(),{...s,...patch},p);quiet=stepRadio(quiet,{...s,...patch,elapsed:60},p);assert.ok(!quiet.calls.some(c=>c.id.startsWith('runway-idle')));
 }
});
