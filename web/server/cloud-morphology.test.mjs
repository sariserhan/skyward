import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudLobes,cloudInterior} from '../src/lib/cloudFormation.ts';
test('cloud shapes are stable per cell but vary between cells and stay inside render bounds',()=>{
 for(const kind of ['cumulus','stratus','cirrus','storm']){
  const shapes=new Set();
  for(let seed=-20;seed<20;seed++){
   const lobes=cloudLobes(kind,seed);assert.equal(lobes,cloudLobes(kind,seed));shapes.add(JSON.stringify(lobes));
   for(const lobe of lobes)for(let axis=0;axis<3;axis++){assert.ok(lobe.radius[axis]>0);assert.ok(Math.abs(lobe.center[axis])+lobe.radius[axis]<1);}
   cloudInterior(0,0,0,3000,1200,kind,seed);assert.equal(lobes.length,4);
  }
  assert.equal(shapes.size,40);
 }
});
