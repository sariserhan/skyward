import test from 'node:test';
import assert from 'node:assert/strict';
import {globeAltitude} from '../src/lib/globeFraming.ts';
test('Earth with limb padding fits portrait, landscape and desktop fields of view',()=>{
 for(const [w,h] of [[390,706],[320,500],[844,252],[1200,900]]){
  const altitude=globeAltitude(w,h),halfFov=Math.atan(Math.tan(Math.PI/6)*Math.min(w/h,h/w));
  assert.ok(Math.asin(6378137/(6378137+altitude))<halfFov);
  assert.ok(altitude<=65000000);
 }
 assert.equal(globeAltitude(1200,900),12000000);
});
