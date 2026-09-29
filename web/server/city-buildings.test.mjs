import test from 'node:test';import assert from 'node:assert/strict';
import {cityTiles,cityHeight,clipCityRing} from '../src/lib/cityBuildings.ts';
test('city streaming stays bounded and wraps the dateline',()=>{
 for(const lon of [-180,179.999,0]){const tiles=cityTiles(lon,40,'high');assert.equal(tiles.length,9);assert.equal(new Set(tiles.map(t=>t.key)).size,9);assert.ok(tiles.every(t=>t.x>=0&&t.x<16384&&t.y>=0&&t.y<16384));}
 assert.equal(cityTiles(28.97,41,'low').length,4);assert.deepEqual(cityTiles(NaN,0,'high'),[]);assert.deepEqual(cityTiles(0,89,'high'),[]);
});
test('city heights preserve mapped base elevations and bound malformed values',()=>{
 assert.deepEqual(cityHeight({render_height:120,render_min_height:15}),{height:120,base:15});assert.deepEqual(cityHeight({render_height:'bad',render_min_height:-8}),{height:9,base:0});assert.equal(cityHeight({render_height:1e9}).height,1200);
});
test('tile buffers clip to bounds and discard polygons completely outside the tile',()=>{
 const ring=[{x:-5,y:-5},{x:15,y:-5},{x:15,y:15},{x:-5,y:15},{x:-5,y:-5}];const clipped=clipCityRing(ring,10);assert.ok(clipped.length>=4);assert.ok(clipped.every(p=>p.x>=0&&p.x<=10&&p.y>=0&&p.y<=10));assert.deepEqual(clipCityRing([{x:-5,y:-5},{x:-2,y:-5},{x:-2,y:-2}],10),[]);
});
