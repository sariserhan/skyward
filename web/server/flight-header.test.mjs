import test from 'node:test';import assert from 'node:assert/strict';
import {flightHeaderRoute} from '../src/lib/flightHeader.ts';
test('flight heading shows matching endpoints and keeps absent or unverified routes explicit',()=>{
 const a={callsign:'THY111'},route={callsign:'THY111',status:'PLAUSIBLE',airports:[{iata:'IST'},{iata:'JFK'}]};
 assert.equal(flightHeaderRoute(a,route),'IST → JFK');assert.match(flightHeaderRoute(a,{...route,status:'UNVERIFIED'}),/unverified/);
 assert.equal(flightHeaderRoute(a,{...route,callsign:'OTHER'}),'Route unavailable');assert.equal(flightHeaderRoute(a,null),'Route unavailable');
});
