import test from 'node:test';import assert from 'node:assert/strict';
import {runwayLighting,runwayFlash,runwayLampColor} from '../src/lib/runwayLighting.ts';
const r={a:[0,0],b:[.03,0],width:45,length:3333};
test('runway layout separates steady guidance from synchronized threshold and inward approach flashes',()=>{
 const lamps=runwayLighting(r);assert.ok(lamps.length<400);assert.equal(lamps.filter(l=>l.kind==='reil').length,4);assert.equal(lamps.filter(l=>l.kind==='threshold').length,14);
 for(const end of [0,1]){const approach=lamps.filter(l=>l.kind==='approach'&&l.end===end).sort((a,b)=>a.sequence-b.sequence);assert.equal(approach.length,8);assert.ok(end?approach[0].lon>approach[7].lon:approach[0].lon<approach[7].lon);for(let i=0;i<8;i++)assert.equal(runwayFlash('approach',i,i*.05+.01),1);}
 assert.equal(runwayFlash('reil',0,.02),1);assert.ok(runwayFlash('reil',0,.2)<.1);assert.equal(runwayFlash('reil',0,.52),1);
 for(const kind of ['edge','center','threshold','crossbar'])for(let t=0;t<2;t+=.017)assert.equal(runwayFlash(kind,0,t),1);
 for(const kind of ['reil','approach'])for(let t=0;t<2;t+=.017)assert.equal(runwayFlash(kind,0,t,true),1);
});
test('directional threshold, runway caution and centerline colors match viewing direction',()=>{
 assert.equal(runwayLampColor({kind:'threshold'},3000,false,true),'#48ff89');assert.equal(runwayLampColor({kind:'threshold'},3000,false,false),'#ff493f');
 assert.equal(runwayLampColor({kind:'edge',t:.9},3000,false,false),'#ffd35b');assert.equal(runwayLampColor({kind:'edge',t:.9},3000,true,false),'#fff2dd');
 assert.equal(runwayLampColor({kind:'center',t:.95},3000,false,false),'#ff493f');
});
test('layout wraps the dateline and rejects unusable geometry without unbounded light counts',()=>{
 const lamps=runwayLighting({...r,a:[179.99,60],b:[-179.99,60]});assert.ok(lamps.length);assert.ok(lamps.every(l=>Math.abs(l.lon)<=180&&Number.isFinite(l.lat)));assert.deepEqual(runwayLighting({...r,width:NaN}),[]);assert.deepEqual(runwayLighting({...r,b:r.a}),[]);assert.ok(runwayLighting({...r,length:100000}).length<400);
});
