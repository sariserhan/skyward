import test from 'node:test';
import assert from 'node:assert/strict';
import {cabinReference,cabinReferences,scenarioPassengers} from '../src/lib/cabin.ts';
const a={aircraftType:'B738',callsign:'THY111',targetKind:'aircraft'};
test('published cabin sources are explicit and operator examples stay distinct',()=>{
 assert.equal(cabinReference(a).minimum,162);
 assert.equal(cabinReference({...a,callsign:'RYR11'}).minimum,189);
 assert.equal(cabinReference({...a,callsign:'UNKNOWN'}).minimum,160);
 assert.equal(cabinReference({...a,aircraftType:'B38M',callsign:'RYR11'}).minimum,197);
 for(const r of Object.values(cabinReferences)){
  assert.ok(r.minimum>0&&r.maximum>=r.minimum);assert.ok(r.url.startsWith('https://'));assert.ok(r.publisher&&r.configuration&&r.checked);
 }
});
test('unknown, cargo and non-aircraft never inherit passenger counts from model aliases',()=>{
 for(const aircraftType of ['B77F','B744','AT72','E35L','UNKNOWN',''])assert.equal(cabinReference({...a,aircraftType}),null);
 assert.equal(cabinReference({...a,targetKind:'vehicle'}),null);
 assert.equal(cabinReference({...a,aircraftType:'B38M'}),null);
});
test('simulation is bounded, deterministic, and never mutates observations',()=>{
 const observed=Object.freeze({...a,observedAt:1});const r=cabinReference(observed);
 assert.equal(scenarioPassengers(r.minimum,80),130);
 assert.equal(scenarioPassengers(r.minimum,80),130);
 assert.equal(scenarioPassengers(189,0),0);assert.equal(scenarioPassengers(189,150),189);
 assert.equal(scenarioPassengers(189,-10),0);assert.equal(scenarioPassengers(NaN,80),0);
 assert.deepEqual(observed,{...a,observedAt:1});
});
test('new long-haul and narrow-body references retain exact type boundaries',()=>{
 assert.deepEqual(['B788','B789','B78X','A21N'].map(aircraftType=>cabinReference({...a,aircraftType}).minimum),[200,250,300,180]);
 assert.equal(cabinReference({...a,aircraftType:'B77F'}),null);
});
