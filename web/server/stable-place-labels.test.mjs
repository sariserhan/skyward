import test from 'node:test';import assert from 'node:assert/strict';
import {retainPlaceLabels,PlaceLabelVisibility} from '../src/lib/stablePlaceLabels.ts';
const city=(name,lon=0)=>({name,lon,lat:0,rank:6,capital:false,population:0,country:''});
test('missing and overlapping tile updates preserve label anchors without unbounded growth',()=>{
 const a=city('Reston',.01);assert.deepEqual(retainPlaceLabels([a],[]),[a]);assert.equal(retainPlaceLabels([a],[city('Reston',.02)])[0],a);
 assert.equal(retainPlaceLabels([a],Array.from({length:800},(_,i)=>city(String(i)))).length,600);
});
test('brief visibility windows never flash labels and aircraft occlusion hides immediately',()=>{
 const label=new PlaceLabelVisibility();assert.equal(label.update(true,0),false);assert.equal(label.update(false,250),false);assert.equal(label.update(true,500),false);assert.equal(label.update(true,850),true);
 assert.equal(label.update(false,900),false);assert.equal(label.update(true,950),false);assert.equal(label.update(true,1300),true);
});
