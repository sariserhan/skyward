import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from 'cesium';
import {skyPositions,SKY_BODIES,planetIcon} from '../src/lib/celestial.ts';
import {sunDirectionFixed} from '../src/lib/solarLighting.ts';

test('Calculated Sun agrees with the scene lighting direction through the seasons',()=>{
  for(const iso of ['2026-03-20T12:00:00Z','2026-06-21T00:00:00Z','2026-09-28T00:00:00Z','2026-12-21T18:00:00Z']){
    const date=new Date(iso),sun=skyPositions(date).find(x=>x.name==='Sun'),lit=sunDirectionFixed(C,C.JulianDate.fromDate(date));
    const angle=Math.acos(Math.min(1,C.Cartesian3.dot(lit,new C.Cartesian3(sun.direction.x,sun.direction.y,sun.direction.z))))*180/Math.PI;
    assert.ok(angle<1,`${iso}: ${angle} degrees`);
  }
});
test('All nine sky objects have finite directions and meaningful geocentric distances',()=>{
  const bodies=skyPositions(new Date('2026-09-28T00:00:00Z'));
  assert.equal(bodies.length,9);assert.equal(new Set(bodies.map(b=>b.name)).size,9);
  for(const b of bodies){assert.ok(Math.abs(Math.hypot(b.direction.x,b.direction.y,b.direction.z)-1)<1e-12);assert.ok(b.distanceAu>0&&b.distanceAu<40);}
  assert.ok(bodies.find(b=>b.name==='Moon').distanceAu<.003);
  assert.deepEqual(skyPositions(new Date(NaN)),[]);
  for(const b of SKY_BODIES)assert.ok(planetIcon(b.name,b.color).startsWith('data:image/svg+xml,'));
});

test('Moon illumination follows known new and full Moon dates, with finite terminator paths',async()=>{
 const {moonState,moonLitPath}=await import('../src/lib/celestial.ts');
 const fresh=moonState(new Date('2024-04-08T18:21:00Z')),full=moonState(new Date('2024-04-23T23:49:00Z'));
 assert.ok(fresh.fraction<.001);assert.equal(fresh.name,'New Moon');assert.ok(full.fraction>.999);assert.equal(full.name,'Full Moon');
 for(const fraction of [0,.25,.5,.75,1])assert.ok(!/NaN|Infinity/.test(moonLitPath(fraction)));
 assert.equal(moonState(new Date('2026-09-28T00:00:00Z')).name,'Waning gibbous');
 assert.notEqual(planetIcon('Moon','#ddd',fresh),planetIcon('Moon','#ddd',full));
});
