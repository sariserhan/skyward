import test from 'node:test';
import assert from 'node:assert/strict';
import {routeOverview,routeArc} from '../src/lib/routeOverview.ts';
const route={status:'PLAUSIBLE',airports:[{lon:0,lat:0},{lon:10,lat:0}]};
test('route overview separates direct distance from recorded track and excludes gaps and future positions',()=>{
 const point=(time,lon)=>({time,lon,lat:0,altitude:10000,ground:false});const r=routeOverview(route,{lon:5,lat:0},[point(0,0),point(60000,.1),point(300000,5),point(400000,6)],300000);
 assert.ok(Math.abs(r.fraction-.5)<1e-8);assert.ok(r.remaining>299&&r.remaining<301);assert.ok(r.observed>5.9&&r.observed<6.1);assert.equal(r.gaps,1);
 assert.equal(routeOverview({...route,status:'POSITION_MISMATCH'},{lon:5,lat:0},[],0),null);assert.equal(routeOverview({...route,airports:[...route.airports,{lon:20,lat:0}]},{lon:5,lat:0},[],0),null);assert.equal(routeOverview(route,{lon:null,lat:0},[],0),null);
});
test('route arcs take the short dateline crossing and remain finite for coincident and antipodal airports',()=>{
 const arc=routeArc({lon:179,lat:10},{lon:-179,lat:10});assert.ok(arc.every(p=>Math.abs(p.lon)>178));assert.ok(Math.abs(arc.at(-1).lon+179)<1e-8);
 for(const b of [{lon:0,lat:0},{lon:180,lat:0}])assert.ok(routeArc({lon:0,lat:0},b).every(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)));
});
