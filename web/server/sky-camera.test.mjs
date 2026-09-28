import test from 'node:test';
import assert from 'node:assert/strict';
import {skyCameraPose} from '../src/lib/skyCamera.ts';
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
test('sky camera poses are finite and orthonormal, including polar directions',()=>{
 for(const target of [{x:1,y:0,z:0},{x:0,y:0,z:250000000},{x:0,y:0,z:-250000000},{x:1e-10,y:1,z:1e9},{x:300,y:-500,z:700}]){
  const pose=skyCameraPose(target);assert.ok(pose);assert.ok(Math.abs(dot(pose.direction,pose.up))<1e-12);assert.ok(Math.abs(dot(pose.direction,pose.direction)-1)<1e-12);assert.ok(Math.abs(dot(pose.up,pose.up)-1)<1e-12);assert.ok(Math.abs(Math.hypot(...Object.values(pose.position))-20000000)<1e-6);
 }
 for(const target of [{x:NaN,y:0,z:1},{x:Infinity,y:1,z:1},{x:0,y:0,z:0}])assert.equal(skyCameraPose(target),null);
});
