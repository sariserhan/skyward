import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {overlaps} from '../src/lib/atlas.ts';
const atlas=JSON.parse(readFileSync(new URL('../public/data/atlas-v2.json',import.meta.url)));
test('atlas includes valid coast polygons, lakes, rivers, country labels and source provenance',()=>{
 assert.ok(atlas.land.length>1500&&atlas.lakes.length>400&&atlas.rivers.length>800);assert.equal(atlas.sources.length,3);
 for(const layer of [atlas.land,atlas.lakes,atlas.rivers])for(const s of layer){assert.equal(s.bounds.length,4);assert.ok(s.bounds.every(Number.isFinite));assert.ok(s.bounds[0]<=s.bounds[2]&&s.bounds[1]<=s.bounds[3]);for(const r of s.rings)for(const [lon,lat] of r){assert.ok(Math.abs(lon)<=180&&Math.abs(lat)<=90);assert.ok(lon>=s.bounds[0]&&lon<=s.bounds[2]&&lat>=s.bounds[1]&&lat<=s.bounds[3]);}}
 assert.ok(atlas.labels.some(x=>x.name==='United States of America'));assert.ok(atlas.labels.some(x=>x.name==='Japan'));for(const s of atlas.sources)assert.match(s.sha256,/^[0-9a-f]{64}$/);
});
test('tile bounding checks retain shared edges and exclude distant geometry',()=>{
 assert.ok(overlaps([-10,0,10,20],[10,10,30,30]));assert.ok(overlaps([-180,-90,180,90],[-77,38,-76,39]));assert.equal(overlaps([170,0,180,10],[-180,0,-170,10]),false);assert.equal(overlaps([0,0,1,1],[2,2,3,3]),false);
});
