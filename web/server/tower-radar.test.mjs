import test from 'node:test';
import assert from 'node:assert/strict';
import {radarPoint,radarReadout} from '../src/lib/towerRadar.ts';
test('radar projection is north up and distance-scaled across the dateline',()=>{
 const center={lon:0,lat:0},origin=radarPoint(center,center,10);assert.equal(origin.x,150);assert.equal(origin.y,150);
 const north=radarPoint(center,{lon:0,lat:.1},10),east=radarPoint(center,{lon:.1,lat:0},10);assert.ok(north.y<150);assert.ok(Math.abs(north.x-150)<.01);assert.ok(east.x>150);assert.ok(Math.abs(east.y-150)<.01);
 assert.ok(Math.abs(north.distance-6)<.02);assert.equal(radarPoint(center,{lon:0,lat:.1},5).inside,false);
 assert.ok(radarPoint({lon:179.99,lat:0},{lon:-179.99,lat:0},5).inside);assert.equal(radarPoint(center,center,0),null);assert.equal(radarPoint(center,{lon:0,lat:NaN},10),null);
});
test('radar readouts preserve unknown values and distinguish ground and vertical trends',()=>{
 assert.equal(radarReadout({ground:false,altitude:2500,groundSpeed:160,verticalRate:-700}),'2,500 ft ↓ · 160 kt');
 assert.equal(radarReadout({ground:true,altitude:0,groundSpeed:0,verticalRate:0}),'GND · 0 kt');
 assert.equal(radarReadout({ground:false,altitude:null,groundSpeed:null,verticalRate:null}),'ALT — · GS —');
});
