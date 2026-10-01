import test from 'node:test';
import assert from 'node:assert/strict';
import {connectedTaxiPaths} from '../src/lib/taxiConnectivity.ts';
import {planTaxi} from '../src/lib/taxiRoute.ts';
const point=(x,y)=>[x/111120,y/111120];
const path=(kind,points)=>({kind,points:points.map(([x,y])=>point(x,y))});
const base={id:'TEST',lat:0,lon:0,surfaces:[],runways:[],gates:[{label:'A1',position:point(1200,300)}]};
test('mapped endpoint on another segment joins without connecting adjacent parallel pavement',()=>{
 const a={...base,paths:[path('taxiway',[[0,0],[500,0]]),path('parking_position',[[250,0],[250,100]]),path('taxiway',[[300,5],[300,100]])]};
 const result=connectedTaxiPaths(a);
 assert.ok(result[0].points.some(p=>p[0]===point(250,0)[0]));
 assert.ok(!result[0].points.some(p=>p[0]===point(300,5)[0]));
 assert.equal(a.paths[0].points.length,2);
 assert.equal(connectedTaxiPaths(a),result);
});
test('runway crossing between mapped vertices connects to a stand in either runway direction',()=>{
 const a={...base,paths:[path('taxiway',[[1200,-100],[1200,200]]),path('parking_position',[[1200,200],[1200,300]])]};
 for(const [start,end] of [[0,2400],[2400,0]]){
  const route=planTaxi(a,{lon:point(start,0)[0],lat:0},{lon:point(end,0)[0],lat:0});
  assert.ok(route);assert.equal(route.gate,'A1');assert.ok(route.points.every(p=>Math.abs(p.lon-point(1200,0)[0])*111120<26));
 }
});
test('building clearance still rejects a connected but obstructed mapped route',()=>{
 const a={...base,paths:[path('taxiway',[[1200,-100],[1200,200]]),path('parking_position',[[1200,200],[1200,300]])],surfaces:[{kind:'terminal',points:[[1150,80],[1250,80],[1250,120],[1150,120]].map(([x,y])=>point(x,y))}]};
 assert.equal(planTaxi(a,{lon:0,lat:0},{lon:point(2400,0)[0],lat:0}),null);
});
test('unlabeled mapped parking centerlines work without inventing gate numbers',()=>{
 const a={...base,gates:[],paths:[path('taxiway',[[1200,-100],[1200,200]]),path('parking_position',[[1200,200],[1200,300]])]};
 const route=planTaxi(a,{lon:0,lat:0},{lon:point(2400,0)[0],lat:0});
 assert.ok(route);assert.match(route.gate,/unassigned mapped stand/);
});
