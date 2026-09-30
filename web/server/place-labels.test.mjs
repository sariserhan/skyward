import test from 'node:test';import assert from 'node:assert/strict';
import {tilePlace} from '../src/lib/placeLabels.ts';
const tile={x:256,y:256,z:9,key:'9/256/256'};
test('place labels decode real tile coordinates and prefer English names',()=>{
 const p=tilePlace({class:'town',name:'Local','name:en':'Town'}, {x:0,y:0},4096,tile);
 assert.equal(p.name,'Town');assert.equal(p.lon,0);assert.equal(p.lat,0);assert.equal(p.rank,8);
 const southeast=tilePlace({class:'village',name:'Village'},{x:2048,y:2048},4096,tile);
 assert.ok(southeast.lon>0&&southeast.lat<0);assert.equal(southeast.rank,10);
});
test('buffer duplicates, non-place features and invalid coordinates are excluded',()=>{
 for(const point of [undefined,{x:-1,y:0},{x:4096,y:0},{x:0,y:4096},{x:NaN,y:0}])assert.equal(tilePlace({class:'city',name:'City'},point,4096,tile),null);
 for(const properties of [{class:'country',name:'Country'},{class:'town',name:' '}])assert.equal(tilePlace(properties,{x:1,y:1},4096,tile),null);
 assert.equal(tilePlace({class:'city',name:'City'},{x:1,y:1},0,tile),null);
});
