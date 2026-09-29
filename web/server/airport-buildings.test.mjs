import test from 'node:test';import assert from 'node:assert/strict';
import {airportBuildingHeight,airport3DTarget} from '../src/lib/airportBuildings.ts';
test('airport surfaces preserve building heights and never turn aprons into buildings',()=>{
 for(const height of [0,12,NaN])assert.equal(airportBuildingHeight({kind:'apron',height}),undefined);
 assert.equal(airportBuildingHeight({kind:'terminal',height:22}),22);
 assert.equal(airportBuildingHeight({kind:'building',height:NaN}),8);
 assert.equal(airportBuildingHeight({kind:'terminal',height:0}),12);
});
test('3D airport framing centers on terminals and handles missing footprints and dateline',()=>{
 const airport={id:'TEST',lat:10,lon:179.99,surfaces:[]};
 assert.equal(airport3DTarget(airport).range,7000);
 airport.surfaces=[{kind:'terminal',points:[[179.99,10],[-179.99,10],[-179.99,10.01]],height:12},{kind:'apron',points:[[0,0],[1,1],[2,2]],height:0}];
 const target=airport3DTarget(airport);assert.ok(Math.abs(target.lon)>179.9);assert.ok(target.range<5000);assert.ok(Math.abs(target.lat-10.005)<1e-6);
});
