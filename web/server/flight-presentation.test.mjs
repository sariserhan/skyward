import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fleetProfile,fleetPaint,fleetUri,fallbackFleetUri,observedFrame,runwayFrame} from '../src/lib/flightPresentation.ts';
const a={lon:179.95,lat:10,altitude:1000,time:1000,ground:false},b={...a,lon:-179.95,altitude:2000,time:26000};
test('visual motion interpolates received fixes across dateline, freezes and refuses coverage gaps',()=>{
 const mid=observedFrame([a,b],13500);assert.equal(Math.abs(mid.lon),180);assert.equal(mid.altitude,1500);assert.ok(mid.interpolated);
 assert.deepEqual(observedFrame([a,b],90000),{...b,interpolated:false});
 assert.deepEqual(observedFrame([a,{...b,time:200000}],100000),{...a,interpolated:false});assert.equal(observedFrame([],1000),null);
});
test('fleet fallbacks stay explicit and every mapped palette/profile has valid mesh buffers',()=>{
 assert.equal(fleetProfile('B77W'),'b777');assert.equal(fleetProfile('A21N'),'a321');assert.equal(fleetProfile('ZZZZ'),'generic');assert.equal(fleetPaint('TEST1'),'neutral');
 for(const type of ['A320','A321','B738','B77W','B789','A333','A359','A388','B744','E75L','ZZZZ'])for(const callsign of ['THY1','UAL1','DAL1','TEST1']){
 const uri=fallbackFleetUri({aircraftType:type,callsign});const g=JSON.parse(readFileSync(new URL('../public/'+uri,import.meta.url)));assert.ok(g.nodes.some(n=>n.name==='Gear'));for(const buf of g.buffers)assert.ok(existsSync(new URL('../public/models/fleet/'+buf.uri,import.meta.url)));
 }
});
test('demonstrations start and finish on correct sides and stop landing rollout within runway',()=>{
 const r={a:[0,0],b:[.03,0],id:'09/27',length:3300,width:45};
 assert.equal(runwayFrame(r,'takeoff',0).altitude,0);assert.ok(runwayFrame(r,'takeoff',1).altitude>1000);
 assert.ok(runwayFrame(r,'landing',0).lon<0);const end=runwayFrame(r,'landing',1);assert.ok(end.lon>0&&end.lon<.03);assert.equal(end.altitude,0);assert.equal(end.heading,90);
});
