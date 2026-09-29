import test from 'node:test';import assert from 'node:assert/strict';
import {waterMotion} from '../src/lib/waterSurface.ts';
import {cityTiles} from '../src/lib/cityBuildings.ts';
test('water animation respects pause, reduced motion and graphics budgets',()=>{
 assert.deepEqual(waterMotion('low',false,false),{interval:100,animated:true});assert.equal(waterMotion('high',true,false).animated,false);assert.equal(waterMotion('balanced',false,true).animated,false);assert.equal(waterMotion('balanced',false,false).interval,50);
});
test('water coverage uses bounded zoom-appropriate tiles across the dateline',()=>{
 for(const z of [12,13]){const tiles=cityTiles(179.999,40,'balanced',z);assert.equal(tiles.length,9);assert.ok(tiles.every(t=>t.z===z&&t.x>=0&&t.x<2**z&&t.y<2**z));assert.equal(new Set(tiles.map(t=>t.key)).size,9);}
});
