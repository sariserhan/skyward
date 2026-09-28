import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {AIRFRAMES,commandFlight,goAround,initialFlight,stepFlight,chooseRunway,runwayStart,runwayHeading,movePoint,nauticalMiles} from '../src/lib/flightSimulator.ts';
import {careerSummary,connectionTimeline} from '../src/lib/premiumExperience.ts';
const geometry=id=>JSON.parse(readFileSync(new URL(`../public/data/airports/${id}.json`,import.meta.url)));
const a=geometry('IAD'),b=geometry('DCA');
const plan=(type='B738',difficulty='easy',challenge='calm')=>({from:'IAD',to:'DCA',departure:chooseRunway(a.runways,b,true,type),arrival:chooseRunway(b.runways,a,false,type),difficulty,aircraftType:type,challenge});
const neutral={pitch:0,roll:0,rudder:0};
test('Easy assistance takes each airframe from runway through takeoff, cruise, touchdown and full stop',()=>{for(const type of ['B738','C172','C560'])for(const challenge of ['calm','crosswind']){const p=plan(type,'easy',challenge),phases=new Set();let s={...initialFlight(p),autopilot:true},last=s;for(let n=0;n<4000&&!['landed','crashed'].includes(s.phase);n++){last=s;s=stepFlight(s,p,neutral,1);phases.add(s.phase);assert.ok(nauticalMiles(last,s)<.2,'no teleportation');assert.ok(Number.isFinite(s.altitude));}assert.equal(s.phase,'landed',type+': '+s.warning);assert.equal(s.speed,0);assert.equal(s.gear,true);assert.ok(s.touchdownRate<0&&s.touchdownRate>-600);for(const phase of ['takeoff','climb','cruise','approach','landing','rollout','landed'])assert.ok(phases.has(phase),`${type}: ${phase}`);assert.equal(s.assisted,true);}});
test('Advanced controls turn and pitch the aircraft; stall and gear-up landing fail honestly',()=>{const p=plan('B738','advanced'),start={...initialFlight(p),ground:false,phase:'cruise',altitude:3000,speed:220,gear:false,throttle:.5};const s=stepFlight(start,p,{pitch:1,roll:1,rudder:0},2);assert.ok(s.pitch>10);assert.ok(s.bank>20);assert.notEqual(s.heading,start.heading);const stall=stepFlight({...start,speed:40},p,neutral,2);assert.match(stall.warning,/STALL/);assert.ok(stall.altitude<start.altitude);const near={...start,...movePoint(runwayStart(p.arrival),runwayHeading(p.arrival),.2),altitude:.1,heading:runwayHeading(p.arrival),pitch:-2,bank:0,speed:145,verticalSpeed:-200};assert.equal(stepFlight(near,p,neutral,.1).phase,'crashed');});
test('Ground brakes hold, short/unmapped runways reject aircraft and fixed steps do not depend on display frame rate',()=>{const p=plan(),s={...initialFlight(p),throttle:1};assert.equal(stepFlight(s,p,neutral,2).speed,0);assert.throws(()=>chooseRunway([{...p.departure,length:100}],b,true,'B738'),/No mapped runway/);let x={...s,brakes:false},y={...x};for(let n=0;n<120;n++)x=stepFlight(x,p,neutral,1/60);for(let n=0;n<40;n++)y=stepFlight(y,p,neutral,1/20);assert.ok(Math.abs(x.speed-y.speed)<.1);assert.ok(nauticalMiles(x,y)<.001);});
test('Trip connections use only verified details and achievements separate manual and assisted landings',()=>{const trip={name:'Connection',legs:[{from:'IAD',to:'LHR',journeyKey:'one',departureAt:100000,arrivalAt:1000000},{from:'LHR',to:'IST',journeyKey:'two',departureAt:4600000,arrivalAt:6000000}]};assert.equal(connectionTimeline(trip,[{key:'one',details:{mode:'demo',flight:{arrival:{estimatedAt:4000000}}}}])[1].connectionMinutes,60);const line=connectionTimeline(trip,[{key:'one',details:{mode:'live',status:'MATCHED_RECENT_AIRCRAFT',flight:{arrival:{estimatedAt:5000000}}}}]);assert.equal(line[1].connectionLabel,'Connection overlap');const c=careerSummary([{result:'landed',from:'IAD',to:'DCA',difficulty:'easy',assisted:true,touchdownRate:-200,challenge:'precision',duration:600}]);assert.ok(c.badges.includes('Soft touchdown'));assert.ok(!c.badges.includes('Manual aviator'));});

test('Ground contact blocks pitch and bank at rest and taxi speed, with speed-dependent rotation',()=>{
 for(const type of ['B738','C172','C560'])for(const difficulty of ['easy','advanced']){
  const p=plan(type,difficulty);
  for(const pitch of [-1,1]){let s={...initialFlight(p),trim:10};for(let i=0;i<10;i++)s=stepFlight(s,p,{pitch,roll:1,rudder:0},1);assert.equal(s.pitch,0);assert.equal(s.bank,0);assert.equal(s.altitude,0);assert.equal(s.ground,true);}
  let taxi={...initialFlight(p),brakes:false,speed:20};taxi=stepFlight(taxi,p,{pitch:1,roll:1,rudder:0},2);assert.equal(taxi.pitch,0);assert.equal(taxi.bank,0);assert.equal(taxi.ground,true);
  let rotate={...initialFlight(p),brakes:false,speed:AIRFRAMES[type].rotate+5,throttle:1,enginePower:1};for(let i=0;i<120&&rotate.ground;i++){rotate=stepFlight(rotate,p,{pitch:1,roll:0,rudder:0},1/60);assert.ok(rotate.pitch>=0&&rotate.pitch<=8);}assert.equal(rotate.ground,false);assert.ok(rotate.altitude>0);
 }
});
test('Gear commands respect weight on wheels, fixed gear and transit time; unfinished gear cannot land',()=>{
 const p=plan('B738','advanced'),ground=initialFlight(p);assert.equal(commandFlight(ground,p,{gear:false}).gear,true);
 const flying={...ground,ground:false,phase:'cruise',altitude:3000,speed:180,enginePower:.5};
 let up=stepFlight(commandFlight(flying,p,{gear:false}),p,neutral,2);assert.ok(up.gearPosition>.6&&up.gearPosition<.8);
 for(let i=0;i<3;i++)up=stepFlight(up,p,neutral,2);assert.equal(up.gearPosition,0);
 const fixed=commandFlight({...initialFlight(plan('C172')),ground:false},plan('C172'),{gear:false});assert.equal(fixed.gear,true);assert.equal(commandFlight(fixed,plan('C172'),{speedbrake:true,reverse:true}).speedbrake,false);
 const near={...flying,...movePoint(runwayStart(p.arrival),runwayHeading(p.arrival),.2),gear:true,gearPosition:.5,altitude:.1,heading:runwayHeading(p.arrival),pitch:-2,speed:145,verticalSpeed:-200};assert.equal(stepFlight(near,p,neutral,.1).phase,'crashed');
 const ap={...flying,autopilot:true};assert.equal(commandFlight(ap,p,{gear:false,throttle:0}).throttle,ap.throttle);
});
test('Engines spool gradually, reverse only works on jets on the ground, go-around preserves position',()=>{
 const p=plan(),start={...initialFlight(p),throttle:1,brakes:false};const s=stepFlight(start,p,neutral,1);assert.ok(s.enginePower>0&&s.enginePower<.5);
 const flying={...start,ground:false,altitude:200,phase:'landing',pitch:-3,speed:140,gear:true,speedbrake:true};assert.equal(commandFlight(flying,p,{reverse:true}).reverse,false);
 const around=goAround(flying,p);assert.equal(around.lon,flying.lon);assert.equal(around.altitude,200);assert.equal(around.throttle,1);assert.equal(around.speedbrake,false);assert.ok(around.pitch>0);assert.equal(around.gear,true);
 const rolling={...initialFlight(p),phase:'rollout',speed:80,throttle:.8,enginePower:.8,brakes:false};assert.ok(stepFlight({...rolling,reverse:true},p,neutral,1).speed<stepFlight(rolling,p,neutral,1).speed);
});
