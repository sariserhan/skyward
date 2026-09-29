import test from 'node:test';import assert from 'node:assert/strict';
import {windshieldRain,wiperAngle,wiperClears,publishWindshieldWeather,windshieldWeather} from '../src/lib/windshield.ts';
const now=Date.now(),report={lat:39,lon:-77,observedAt:now,rain:.7,elevationM:100,clouds:[{cover:'OVC',baseM:800}],storm:false};
test('windshield rain requires current nearby precipitation below cloud tops',()=>{
 assert.equal(windshieldRain(report,39,-77,1000,now),.7);assert.equal(windshieldRain(report,39,-77,10000,now),0);assert.equal(windshieldRain(report,0,0,1000,now),0);assert.equal(windshieldRain(report,39,-77,1000,now+7200001),0);assert.equal(windshieldRain({...report,rain:0},39,-77,1000,now),0);
 const v={};publishWindshieldWeather(v,report);assert.equal(windshieldWeather(v),report);publishWindshieldWeather(v,null);assert.equal(windshieldWeather(v),undefined);
});
test('wipers clear swept droplets in either direction, leaving unswept glass wet',()=>{
 assert.equal(wiperClears(0,-30,0,0,100,-Math.PI,0),false);
 const a=wiperAngle(0),b=wiperAngle(.5);assert.ok(a< -2.9&&b>-.2);
 assert.equal(wiperClears(0,-75,0,0,100,a,b),true);assert.equal(wiperClears(0,-75,0,0,100,b,a),true);
 assert.equal(wiperClears(0,-150,0,0,100,a,b),false);assert.equal(wiperClears(0,50,0,0,100,a,b),false);assert.equal(wiperClears(0,-75,0,0,100,a,a+.1),false);
});
