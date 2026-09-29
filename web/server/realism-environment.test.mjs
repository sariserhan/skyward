import test from 'node:test';import assert from 'node:assert/strict';
import {cloudFormation,cloudInterior,cloudWidth} from '../src/lib/cloudFormation.ts';
import {cloudLayerThickness,altitudeWeather,cloudImmersion} from '../src/lib/localWeather.ts';
import {advancedAerodynamics} from '../src/lib/advancedAerodynamics.ts';
import {ResolutionGovernor} from '../src/lib/resolutionGovernor.ts';
import {waterWind} from '../src/lib/waterSurface.ts';
test('cloud morphology distinguishes high thin ice layers, low decks and storm towers',()=>{
 assert.equal(cloudFormation({baseM:9000,cover:'SCT'},false),'cirrus');assert.equal(cloudFormation({baseM:9000,cover:'SCT'},false,true),'cumulus');assert.equal(cloudFormation({baseM:1000,cover:'OVC'},false),'stratus');assert.equal(cloudFormation({baseM:1000,cover:'FEW'},false),'cumulus');assert.equal(cloudFormation({baseM:9000,cover:'SCT'},true),'storm');
 const r={storm:false,rain:0,snow:0,clouds:[{baseM:9000,cover:'SCT'}]};const t=cloudLayerThickness(r,r.clouds[0]);assert.ok(t<300);assert.equal(altitudeWeather(r,9000+t+1).inside,false);assert.equal(cloudImmersion(r,9000+t+1),0);assert.ok(cloudImmersion(r,9000+t/2)>.9);
});
test('advanced handling exchanges climb energy and adds bank drag without rotating on ground',()=>{
 const level=advancedAerodynamics(200,0,0,5000,35,false),bank=advancedAerodynamics(200,0,45,5000,35,false),climb=advancedAerodynamics(200,8,0,5000,35,false),descent=advancedAerodynamics(200,-8,0,5000,35,false);
 assert.ok(level.gravity===0);assert.ok(climb.gravity<0&&descent.gravity>0);assert.ok(bank.inducedDrag>level.inducedDrag&&bank.bankSink>level.bankSink);assert.ok(advancedAerodynamics(140,0,0,2,35,false).inducedDrag<level.inducedDrag);assert.deepEqual(advancedAerodynamics(140,8,45,0,35,true),{gravity:0,inducedDrag:0,bankSink:0,groundEffect:0});
});
test('resolution governor ignores idle, bounds pressure reductions and slowly restores',()=>{
 const g=new ResolutionGovernor(1.25,0);assert.equal(g.update(2000,100,1),1.25);assert.equal(g.update(4000,100,50),1.25);assert.equal(g.update(6000,100,50),1.25);assert.equal(g.update(8000,100,50),1.15);for(let t=10000;t<120000;t+=2000)g.update(t,100,50);assert.equal(g.update(120000,100,50),.7);for(let t=122000;t<160000;t+=2000)g.update(t,16,100);const recovered=g.update(160000,16,100);assert.ok(recovered>.7&&recovered<=1.25);
});
test('water response remains bounded for missing and extreme winds',()=>{assert.equal(waterWind(null).whitecaps,0);assert.ok(waterWind(30).speed>waterWind(2).speed);assert.ok(waterWind(30).whitecaps>0);assert.equal(waterWind(Infinity).energy,waterWind(null).energy);assert.ok(waterWind(999).energy<=1&&waterWind(999).whitecaps<=.3);});

test('cloud immersion preserves clear gaps between visible volumes',()=>{assert.equal(cloudInterior(5000,0,0,3000,1170,'cumulus',1),0);assert.ok(cloudInterior(0,0,0,3000,1170,'cumulus',1)>0);assert.equal(cloudInterior(0,0,1000,3000,1170,'cumulus',1),0);assert.ok(cloudInterior(0,0,0,3000,260,'cirrus',1)<.2);assert.equal(cloudWidth(6000,'cumulus'),3200);assert.equal(cloudWidth(6000,'stratus'),6000);});

test('powered Advanced flight loses speed in climb and energy in banked turns',async()=>{
 const {initialFlight,stepFlight}=await import('../src/lib/flightSimulator.ts');
 const runway={id:'01/19',a:[1,1],b:[1,1.04],length:4400,width:45},p={from:'TEST',to:'TEST2',departure:runway,arrival:{...runway,a:[2,2],b:[2,2.04]},aircraftType:'B738',difficulty:'advanced',challenge:'calm'},input={pitch:0,roll:0,rudder:0};
 const base={...initialFlight(p),ground:false,phase:'cruise',altitude:5000,speed:200,throttle:.6,enginePower:.6,gear:false,gearPosition:0,flaps:0,flapPosition:0};
 const level=stepFlight(base,p,input,2),climb=stepFlight({...base,pitch:8},p,input,2),descent=stepFlight({...base,pitch:-8},p,input,2),turn=stepFlight({...base,bank:45},p,input,2);
 assert.ok(descent.speed>level.speed&&level.speed>climb.speed);assert.ok(turn.speed<level.speed&&turn.altitude<level.altitude);let partitioned=base;for(let i=0;i<20;i++)partitioned=stepFlight(partitioned,p,input,.1);assert.ok(Math.abs(level.speed-partitioned.speed)<.1);
});
