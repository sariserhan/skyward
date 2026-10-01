import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import rows from '../data/special-aircraft-visuals.json' with {type:'json'};
import {specialAircraftVisual,withSpecialAircraftType} from '../src/lib/specialAircraftVisuals.ts';
import {fleetUri,fullLivery} from '../src/lib/flightPresentation.ts';
test('every special aircraft has a sourced design reference and honest geometry coverage',()=>{
 assert.equal(rows.length,120);assert.equal(new Set(rows.map(r=>r.registration)).size,120);
 for(const r of rows){assert.match(r.designSource,/^https:\/\//);assert.equal(r.exactLivery,false);if(r.modelUri)assert.ok(existsSync(new URL('../public/'+r.modelUri,import.meta.url)));else assert.equal(r.modelMatch,'fallback');}
});
test('registration fills missing type without changing observed motion or overriding provider identity',()=>{
 const a={registration:'9M-XXD',aircraftType:'',callsign:'XAX123',observedAt:123,lat:3,lon:101};
 const result=withSpecialAircraftType(a);assert.equal(result.aircraftType,'A333');assert.equal(result.observedAt,123);assert.equal(result.lat,3);assert.match(fleetUri(result),/a333/);assert.equal(a.aircraftType,'');
 const conflict={...a,aircraftType:'B738'};assert.equal(withSpecialAircraftType(conflict),conflict);assert.equal(specialAircraftVisual(conflict),null);
 const simulated={...a,simulation:{}};assert.equal(withSpecialAircraftType(simulated),simulated);assert.equal(specialAircraftVisual(simulated),null);
 assert.equal(specialAircraftVisual({registration:'UNKNOWN'}),null);
 const dated=rows.find(r=>r.validFrom);assert.ok(dated);assert.equal(specialAircraftVisual({registration:dated.registration},Date.parse('2000-01-01')),null);
});
test('registration can select operator textures but never claims exact special paint',()=>{
 const a={registration:'N746JB',aircraftType:'A320',callsign:'N746JB'};
 assert.equal(fullLivery(a).operator,'JBU');assert.match(fleetUri(a),/a320-JBU/);
 assert.equal(specialAircraftVisual(a).exactLivery,false);
 assert.equal(fullLivery({...a,aircraftType:'B738'}),null);
 assert.equal(fullLivery({...a,simulation:{}}),null);
 for(const operator of ['TAM','VOI']){const paint=fullLivery({aircraftType:'A320',callsign:operator+'1'});assert.ok(paint);const uri=new URL('../public/'+paint.uri,import.meta.url),g=JSON.parse(readFileSync(uri));for(const image of g.images){if(image.uri&&!image.uri.startsWith('data:'))assert.ok(existsSync(new URL(image.uri,uri)));}assert.equal(g.extras.skyward.livery.registrationMatch,false);}
});
