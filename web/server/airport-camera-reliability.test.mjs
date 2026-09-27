import test from 'node:test';
import assert from 'node:assert/strict';
import {airportReplay,airportTrend} from '../src/lib/airportReplay.ts';
import {AIRPORTS} from '../src/lib/airportCatalog.ts';
import {contiguous,qualityRows} from '../src/lib/positionQuality.ts';
import {retainMotion} from '../src/lib/motionHistory.ts';
import {coverageMessage} from '../src/lib/coverageMessage.ts';
import {cameraFloor,reattachBlend} from '../src/lib/cameraSafety.ts';
import {compareFlights} from '../src/lib/comparison.ts';
import {parseRecording} from '../src/lib/sessionRecording.ts';
const home=AIRPORTS.IAD;
const point=(time,offset)=>({time,lat:home.lat,lon:home.lon+offset,altitude:10000,ground:false});
test('airport replay distinguishes inferred directions and preserves clipping gaps',()=>{
 const approach=[point(0,.3),point(30000,.2),point(60000,.1)];assert.equal(airportTrend(approach,home).approaching,true);assert.equal(airportTrend(approach,home).departing,false);
 const r={format:'skyward-session',version:1,name:'test',createdAt:0,tracks:[{identity:{hex:'abcdef'},points:approach},{identity:{hex:'123abc'},points:[point(0,.1),point(30000,.2),point(60000,.3)]}]};
 assert.equal(airportReplay(r,'IAD',25,'approaching').tracks[0].identity.hex,'abcdef');assert.equal(airportReplay(r,'IAD',25,'departing').tracks[0].identity.hex,'123abc');assert.equal(airportReplay(r,'IAD',25,'ground').tracks.length,0);
 const clipped=airportReplay({...r,tracks:[{identity:{hex:'abcdef'},points:[point(0,.01),point(30000,.3),point(60000,.01)]}]},'IAD',5,'all');assert.equal(clipped.tracks[0].points.length,2);assert.equal(contiguous(...clipped.tracks[0].points),false);assert.equal(parseRecording(clipped).tracks[0].points[1].breakBefore,true);
});
test('coverage messages distinguish filters, stale records, offline, provider error and true empty response',()=>{
 assert.match(coverageMessage([{observedAt:1000}],0,2000,false,'',true).title,/Filters/);
 assert.match(coverageMessage([{observedAt:1000}],0,200000,false,'',true).title,/stale/);
 assert.match(coverageMessage([],0,2000,false,'',false).title,/No aircraft reported/);
 assert.match(coverageMessage([],0,2000,false,'error',false).title,/unavailable/);
 assert.match(coverageMessage([],0,2000,false,'',false,false).title,/Offline/);
});
test('camera reattachment is gradual and terrain clearance stays positive',()=>{assert.equal(reattachBlend(0,false),0);assert.equal(reattachBlend(.6,false),.5);assert.equal(reattachBlend(1.2,false),1);assert.equal(reattachBlend(0,true),1);assert.equal(cameraFloor(3000),3025);assert.equal(cameraFloor(undefined),25);assert.equal(cameraFloor(-100),25);});
test('comparison avoids ground altitude differences and exposes timestamp skew',()=>{const a={hex:'a',altitude:35000,groundSpeed:500,observedAt:100000,ground:false},b={...a,hex:'b',altitude:30000,groundSpeed:450,observedAt:70000};assert.deepEqual(compareFlights(a,b),{altitude:5000,speed:50,skew:30});assert.equal(compareFlights(a,{...b,ground:true}).altitude,null);assert.equal(compareFlights(a,a),null);});
test('six simulated hours of changing traffic keep motion and quality retention bounded',()=>{
 const accepted=new Map(),history=new Map();let updates=0;
 for(let time=100000;time<=21700000;time+=35000){const generation=Math.floor((time-100000)/1800000),rows=Array.from({length:600},(_,i)=>({hex:(generation*600+i).toString(16).padStart(6,'0'),targetKind:'aircraft',lat:38,lon:-77+(time%1800000)/1800000,altitude:30000,ground:false,observedAt:time}));const clean=qualityRows(rows,accepted,time);retainMotion(history,clean);updates++;assert.ok(accepted.size<=4000);assert.ok(history.size<=4000);}
 assert.ok(updates>=617);assert.ok([...history.values()].every(points=>points.length<=32));assert.ok([...accepted.values()].every(a=>!a.positionWarning));
});
