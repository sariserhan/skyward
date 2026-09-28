import test from 'node:test';
import assert from 'node:assert/strict';
import {towerQueue} from '../src/lib/towerQueue.ts';
import {radarPoint,radarReadout} from '../src/lib/towerRadar.ts';
import {runwayLightPoints} from '../src/lib/runwayDetails.ts';
import {frameSummary,modelLoadStats,readRenderStats} from '../src/lib/renderDiagnostics.ts';
import {LiveMotion,liveFrame} from '../src/lib/liveMotion.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
const runway={id:'09/27',a:[0,0],b:[.03,0],length:3300,width:45},port={id:'TEST',lon:0,lat:0,runways:[runway],elevationFt:0};
const a={hex:'a',callsign:'TEST1',targetKind:'aircraft',lon:-.08,lat:0,observedAt:100000,ground:false,heading:90,groundSpeed:160,verticalRate:-700,altitude:2000};
test('tower queues use recent motion candidates, separate departures/ground and reject stale overflights',()=>{
 const rows=[a,{...a,hex:'b',lon:.08,verticalRate:900},{...a,hex:'c',lon:.005,ground:true,groundSpeed:5},{...a,hex:'d',verticalRate:0},{...a,hex:'e',observedAt:0}];
 assert.deepEqual(new Set(towerQueue(rows,port,110000).map(q=>q.kind)),new Set(['arrival','departure','ground']));assert.equal(towerQueue(rows,port,110000).length,3);assert.equal(towerQueue([{...a,positionWarning:'bad'}],port,110000).length,0);
});
test('track-up radar puts a target ahead above ownship and labels relative altitude honestly',()=>{
 const ahead=radarPoint({lon:0,lat:0},{lon:.1,lat:0},10,90);assert.ok(Math.abs(ahead.x-150)<.001);assert.ok(ahead.y<150);
 assert.match(radarReadout(a,1000),/^\+1,000 ft/);assert.match(radarReadout(a,3000),/^-1,000 ft/);assert.match(radarReadout(a,null),/^2,000 ft/);
});
test('runway detail remains bounded and follows mapped edges, including the dateline',()=>{
 const points=runwayLightPoints(runway);assert.ok(points.length>20&&points.length<=98);assert.equal(points.filter(p=>p.threshold).length,4);assert.ok(points.every(p=>Math.abs(p.lat)<.001&&p.lon>=0&&p.lon<=.031));
 assert.ok(runwayLightPoints({...runway,a:[179.99,0],b:[-179.99,0]}).every(p=>Math.abs(p.lon)>179));assert.equal(runwayLightPoints({...runway,length:0}).length,0);
});
test('render diagnostics report frame stalls and model latency separately',()=>{
 const summary=frameSummary([16,16,16,80,100,NaN,0]);assert.equal(summary.slowPercent,40);assert.equal(summary.p95,100);
 const viewer={};modelLoadStats(viewer,3,1,2400);assert.equal(readRenderStats(viewer).pendingModels,3);assert.equal(readRenderStats(viewer).lastModelMs,2400);modelLoadStats(viewer,0,0);assert.equal(readRenderStats(viewer).lastModelMs,2400);
});
test('fresh go-around leaves predicted landing and converges within two seconds without a jump',()=>{
 const motion=new LiveMotion(),before=motion.sample(a,[],160000,false,null,port),climb={...a,observedAt:160000,lon:.01,altitude:2400,verticalRate:1800};assert.equal(before.landingPhase,'approach');
 assert.ok(trackDistance(before,motion.sample(climb,[],160000,false,null,port))<1e-6);const after=motion.sample(climb,[],162000,false,null,port);assert.equal(after.landingPhase,undefined);assert.ok(trackDistance(after,liveFrame(climb,[],162000,false,null,port))<1e-6);
});
