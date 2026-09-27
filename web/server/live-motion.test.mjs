import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFrame,liveMotionStatus,LiveMotion} from '../src/lib/liveMotion.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
import {observedFrame} from '../src/lib/flightPresentation.ts';
const a={hex:'abcdef',targetKind:'aircraft',lat:0,lon:0,altitude:30000,ground:false,heading:90,groundSpeed:360,observedAt:100000,verticalRate:0};
test('short cruise gaps animate but long outages stop prediction without altering telemetry',()=>{
 const original=structuredClone(a),frame=liveFrame(a,[],a.observedAt+60000);
 assert.ok(Math.abs(trackDistance(a,frame)-6)<.001);assert.ok(frame.lon>0);assert.equal(frame.altitude,30000);assert.equal(frame.time,a.observedAt);assert.equal(frame.estimated,true);assert.deepEqual(a,original);
 assert.ok(Math.abs(trackDistance(a,liveFrame(a,[],a.observedAt+1800000))-12)<.001);assert.match(liveMotionStatus(a,[],a.observedAt+1800000),/Awaiting live position/);
});
test('prediction crosses the dateline and poles with finite coordinates',()=>{
 const f=liveFrame({...a,lon:179.99},[],160000);assert.ok(f.lon<0);assert.ok(Math.abs(trackDistance({...a,lon:179.99},f)-6)<.001);
 for(const lat of [-90,-89.99,89.99,90]){const frame=liveFrame({...a,lat,heading:0},[],3700000);assert.ok([frame.lat,frame.lon,frame.heading].every(Number.isFinite));assert.ok(Math.abs(frame.lat)<=90&&Math.abs(frame.lon)<=180);}
});
test('ground, non-aircraft, reduced motion and missing/invalid telemetry do not invent movement',()=>{
 for(const patch of [{ground:true},{targetKind:'vehicle'},{targetKind:'fixed'},{heading:null},{groundSpeed:null},{groundSpeed:NaN},{groundSpeed:9999}]){const f=liveFrame({...a,...patch},[],160000);assert.equal(f.estimated,false);assert.equal(f.lon,a.lon);}
 assert.equal(liveFrame(a,[],160000,true).lon,a.lon);assert.equal(liveFrame({...a,observedAt:999999},[],160000),null);assert.equal(liveFrame({...a,lat:NaN},[],160000),null);
});
test('missing speed and heading can come from a recent continuous observed track only',()=>{
 const points=[{lat:0,lon:-.1,altitude:30000,time:40000,ground:false},{lat:0,lon:0,altitude:30000,time:100000,ground:false}];
 const f=liveFrame({...a,heading:null,groundSpeed:null},points,160000);assert.ok(Math.abs(f.lon-.1)<.001);
 assert.equal(liveFrame({...a,heading:null,groundSpeed:null},[points[0],{...points[1],breakBefore:true}],160000).estimated,false);
 assert.deepEqual(observedFrame(points,999999),{...points[1],interpolated:false});
});
test('fresh fixes blend from the previous display and converge to the moving prediction in two seconds',()=>{
 const motion=new LiveMotion(),before=motion.sample(a,[],160000),next={...a,lat:.02,lon:.09,heading:95,observedAt:160000};
 const start=motion.sample(next,[],160001);assert.ok(trackDistance(before,start)<.00001);
 const middle=motion.sample(next,[],161001),end=motion.sample(next,[],162001),target=liveFrame(next,[],162001);
 assert.ok(middle.lat>0&&middle.lat<end.lat);assert.ok(trackDistance(end,target)<.00001);
 const exact=new LiveMotion();const old=exact.sample(a,[],160000);assert.ok(trackDistance(old,exact.sample(next,[],160000))<.00001);
});

test('turn trends decay after 30 seconds and ignore disconnected or implausible history',()=>{
 const pts=[{lat:-.05,lon:-.05,altitude:30000,time:60000,ground:false},{lat:0,lon:-.03,altitude:30000,time:80000,ground:false},{lat:0,lon:0,altitude:30000,time:100000,ground:false}];
 const turning=liveFrame(a,pts,110000),straight=liveFrame(a,[],110000);assert.ok(turning.turnRate>0);assert.ok(turning.lat<straight.lat);
 assert.equal(liveFrame(a,pts,140000).turnRate,0);assert.equal(liveFrame(a,[pts[0],pts[1],{...pts[2],breakBefore:true}],110000).turnRate,0);
});
test('vertical trends settle within 30 seconds and never project a landing',()=>{
 const climb={...a,verticalRate:2400};assert.ok(liveFrame(climb,[],110000).altitude>30000);assert.equal(liveFrame(climb,[],130000).altitude,30600);assert.equal(liveFrame(climb,[],1000000).altitude,30600);
 assert.equal(liveFrame({...a,altitude:1000},[],160000).altitude,1000);assert.ok(liveFrame({...a,altitude:2100,verticalRate:-6000},[],160000).altitude>=1500);assert.equal(liveFrame({...a,verticalRate:Infinity},[],160000).altitude,30000);
});

test('stale approaches stop before projecting through a plausible destination; fresh ground fixes win',()=>{
 const approach={...a,callsign:'TEST1',altitude:1500,verticalRate:-700,groundSpeed:160};
 const route={callsign:'TEST1',status:'PLAUSIBLE',airports:[{lat:0,lon:-5},{lat:0,lon:.03}]};
 const near=liveFrame(approach,[],160000,false,route),later=liveFrame(approach,[],900000,false,route);
 assert.equal(near.predictionLimited,true);assert.equal(near.lon,later.lon);assert.ok(trackDistance(near,route.airports[1])>=.999);assert.equal(near.ground,false);
 const ground={...approach,ground:true,lon:.03,observedAt:900000};assert.equal(liveFrame(ground,[],900000,false,route).lon,.03);assert.equal(liveFrame(ground,[],900000,false,route).estimated,false);
 const other=liveFrame(approach,[],160000,false,{...route,callsign:'OTHER'});assert.ok(other.lon>near.lon);
 assert.equal(liveFrame(approach,[],160000).lon,liveFrame(approach,[],900000).lon);
 assert.deepEqual(approach,{...a,callsign:'TEST1',altitude:1500,verticalRate:-700,groundSpeed:160});
});
