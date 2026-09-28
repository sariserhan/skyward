import test from 'node:test';import assert from 'node:assert/strict';
import {initialFlight,navigationGuidance,movePoint,runwayStart,runwayHeading,stepFlight} from '../src/lib/flightSimulator.ts';
import {initialRadio,stepRadio,headingWords,radioReadback} from '../src/lib/simulatorRadio.ts';
const runway={id:'36/18',a:[-77,38],b:[-77,38.03],length:3300,width:50};
const p={from:'IAD',to:'DCA',departure:runway,arrival:runway,aircraftType:'B738',difficulty:'advanced',challenge:'calm'};
const final={...initialFlight(p),...movePoint(runwayStart(runway),180,4),ground:false,altitude:1500,phase:'approach',speed:145,heading:0,nav:'final',elapsed:50};
test('Radio specifies shortest left/right turns, three-digit headings and an accurate readback',()=>{
 for(const [heading,turn] of [[40,'left'],[320,'right']]){const r=stepRadio(initialRadio(),{...final,heading},p,true),call=r.calls.find(c=>c.id.startsWith('vector-'));assert.ok(call);assert.match(call.text,new RegExp(`turn ${turn} heading three six zero`));assert.match(call.text,/off the planned route/);assert.equal(r.assignedHeading,0);assert.match(radioReadback(r),/Heading three six zero/);}
 assert.equal(headingWords(90),'zero niner zero');assert.equal(headingWords(360),'three six zero');assert.equal(headingWords(359.9),'three six zero');
});
test('Cross-track detection catches parallel displaced flight and uses a tighter approach corridor',()=>{
 const east={...final,...movePoint(final,90,.5)},west={...final,...movePoint(final,270,.5)};
 const right=navigationGuidance(east,p),left=navigationGuidance(west,p);assert.ok(right.crossTrackNm>0);assert.ok(left.crossTrackNm<0);assert.ok(right.offRoute&&left.offRoute);assert.ok(right.error<0&&left.error>0);
});
test('Repeated warnings have cooldown, recovery needs stability, and ground/fuel emergencies suppress vectors',()=>{
 const bad={...final,heading:40};let r=stepRadio(initialRadio(),bad,p,true),count=r.vectorSerial;
 for(let i=1;i<18;i++)r=stepRadio(r,{...bad,elapsed:50+i},p);assert.equal(r.vectorSerial,count);
 r=stepRadio(r,{...bad,elapsed:69},p);assert.equal(r.vectorSerial,count+1);
 r=stepRadio(r,{...final,elapsed:70},p);assert.equal(r.offRoute,true);r=stepRadio(r,{...final,elapsed:74},p);assert.equal(r.offRoute,false);assert.match(r.calls.at(-1).text,/Back on course/);count=r.vectorSerial;r=stepRadio(r,{...final,elapsed:75},p);assert.equal(r.vectorSerial,count);
 for(const patch of [{ground:true},{fuelExhausted:true,fuelKg:0},{altitude:150},{phase:'crashed',ground:true},{altitude:100,gearPosition:0}])assert.ok(!stepRadio(initialRadio(),{...bad,...patch},p,true).calls.some(c=>c.id.startsWith('vector-')));
});
test('Manual flights progress through the same navigation legs as autopilot',()=>{
 let s={...initialFlight(p),ground:false,altitude:1000,phase:'climb',speed:200};s=stepFlight(s,p,{pitch:0,roll:0,rudder:0},.025);assert.equal(s.nav,'intercept');
 s=stepFlight({...s,...movePoint(runwayStart(runway),runwayHeading(runway)+180,10)},p,{pitch:0,roll:0,rudder:0},.025);assert.equal(s.nav,'align');
 s=stepFlight({...s,...movePoint(runwayStart(runway),runwayHeading(runway)+180,5)},p,{pitch:0,roll:0,rudder:0},.025);assert.equal(s.nav,'final');
});
