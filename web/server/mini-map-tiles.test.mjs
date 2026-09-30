import test from 'node:test';import assert from 'node:assert/strict';
import {mercatorY,miniMapTiles} from '../src/lib/miniMapTiles.ts';
test('Mercator is centered, latitude-clamped and north-up',()=>{assert.ok(Math.abs(mercatorY(0)-.5)<1e-10);assert.ok(mercatorY(40)<.5);assert.equal(mercatorY(90),mercatorY(85.05112878));assert.ok(Number.isFinite(mercatorY(-90)));});
test('tile windows remain small and wrap at the antimeridian',()=>{for(const lon of [-180,179.999,0])for(const lat of [-85,0,85])for(const span of [.03125,8,360]){const tiles=miniMapTiles(lon,lat,span);assert.ok(tiles.length>0&&tiles.length<=20);assert.ok(tiles.every(t=>t.x>=0&&t.x<2**t.z&&t.y>=0&&t.y<2**t.z&&Number.isFinite(t.left+t.top+t.size)));}});
