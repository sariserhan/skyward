import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '@cesium/engine';
import {sunDirectionFixed,solarElevation,sunlightAmount,aircraftSunColor} from '../src/lib/solarLighting.ts';
test('real UTC sun produces opposite day/night hemispheres around the equinox',()=>{
 const sun=sunDirectionFixed(C,C.JulianDate.fromIso8601('2026-03-20T12:00:00Z'));
 const noon=solarElevation(C,C.Cartesian3.fromDegrees(0,0),sun),midnight=solarElevation(C,C.Cartesian3.fromDegrees(180,0),sun);
 assert.ok(noon>85);assert.ok(midnight< -85);assert.equal(sunlightAmount(noon),1);assert.equal(sunlightAmount(midnight),0);
 const later=sunDirectionFixed(C,C.JulianDate.fromIso8601('2026-03-21T00:00:00Z'));assert.ok(solarElevation(C,C.Cartesian3.fromDegrees(0,0),later)< -85);
});
test('solar lighting respects polar summer and winter rather than local clock guesses',()=>{
 const sun=sunDirectionFixed(C,C.JulianDate.fromIso8601('2026-06-21T00:00:00Z'));
 assert.ok(solarElevation(C,C.Cartesian3.fromDegrees(0,89),sun)>20);assert.ok(solarElevation(C,C.Cartesian3.fromDegrees(0,-89),sun)< -20);
});
test('twilight blends continuously and aircraft altitude extends sunlight visibility',()=>{
 const values=[-12,-6,-4,-2,0,2,10].map(x=>sunlightAmount(x));assert.equal(values[0],0);assert.equal(values.at(-1),1);for(let i=1;i<values.length;i++)assert.ok(values[i]>=values[i-1]);
 assert.ok(sunlightAmount(-4,11000)>sunlightAmount(-4,0));assert.equal(sunlightAmount(-30,11000),0);assert.equal(sunlightAmount(-2,-100),sunlightAmount(-2,0));
});

test('aircraft sunlight warms at sunset and dims under cloud without blacking out night',()=>{
 const noon=aircraftSunColor(60),sunset=aircraftSunColor(3),storm=aircraftSunColor(60,0,1),night=aircraftSunColor(-40);
 assert.ok(sunset[0]/sunset[2]>noon[0]/noon[2]);
 assert.ok(storm.every((n,i)=>n<noon[i]&&n>0));
 assert.ok(night.every(n=>n>0&&n<.1));
});
