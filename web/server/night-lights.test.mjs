import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {aircraftLightPulse,lightAnchorToBody} from '../src/lib/aircraftLights.ts';
import anchors from '../src/lib/aircraftLightAnchors.json' with {type:'json'};
import {sourcedCatalog} from '../src/lib/sourcedModels.ts';
test('strobes double-flash and beacon pulses independently; reduced motion disables flashing',()=>{
 assert.equal(aircraftLightPulse(.02).strobe,true);assert.equal(aircraftLightPulse(.1).strobe,false);assert.equal(aircraftLightPulse(.18).strobe,true);assert.equal(aircraftLightPulse(.4).strobe,false);assert.equal(aircraftLightPulse(.55).beacon,true);assert.equal(aircraftLightPulse(.55).strobe,false);
 for(let t=0;t<2.4;t+=.02)assert.deepEqual(aircraftLightPulse(t,0,true),{strobe:false,beacon:false});
 assert.deepEqual(aircraftLightPulse(.18),aircraftLightPulse(1.38));
});
test('authored model light anchors remain finite, with port/starboard on the correct body sides',()=>{
 for(const model of sourcedCatalog){const a=anchors[model.id];assert.ok(a,model.id);assert.ok(Object.values(a).flat().every(Number.isFinite));assert.ok(a.left[0]>a.right[0]);assert.ok(lightAnchorToBody(a.left)[1]>lightAnchorToBody(a.right)[1]);assert.ok(a.tail[2]<0);}
 assert.deepEqual(lightAnchorToBody([2,3,4]),[4,2,3]);
});
test('night-light image retains NASA source provenance and an exact original-file hash',()=>{
 const root=new URL('../public/data/night-lights/',import.meta.url),info=JSON.parse(readFileSync(new URL('source.json',root))),data=readFileSync(new URL('black-marble-2016.jpg',root));assert.equal(info.year,2016);assert.match(info.sourceUrl,/^https:\/\/assets.science.nasa.gov\//);assert.equal(data.length,info.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),info.sha256);assert.equal(data[0],255);assert.equal(data[1],216);
});
