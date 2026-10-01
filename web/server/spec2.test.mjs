import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../data/airframe-catalog.json' with {type:'json'};
import seed from '../data/notable-aircraft.seed.json' with {type:'json'};
import {importAirframeSeed} from '../src/lib/airframeSeed.ts';
import {publishedCatalog,validateCatalog} from '../src/lib/airframeCatalog.ts';
import {associationReviewQueue} from '../src/lib/airframeReview.ts';
import {liveCandidates} from '../src/lib/liveCollections.ts';
import {validateCharters} from '../src/lib/charterAssociations.ts';
import {publicPage} from './public-pages.mjs';
test('seed imports idempotently and cannot silently overwrite or duplicate identity',()=>{
 assert.deepEqual(importAirframeSeed(source,seed),source);
 const changed=structuredClone(seed);changed.aircraft[0].model='Wrong';assert.throws(()=>importAirframeSeed(source,changed),/conflicts/);
 const duplicate=structuredClone(seed);const old=duplicate.aircraft[0].id;duplicate.aircraft[0].id='another-airframe';duplicate.associations.filter(a=>a.aircraftId===old).forEach(a=>{a.aircraftId='another-airframe';a.id+='-copy';});assert.throws(()=>importAirframeSeed(source,duplicate),/duplicate|conflicting/);
});
test('unverified records and private fields never reach the public projection',()=>{
 const c=structuredClone(source);c.aircraft[0].status='UNVERIFIED';c.aircraft[1].homeAddress='PRIVATE';c.associations[2].status='UNVERIFIED';c.associations[3].notes='PRIVATE';
 const p=publishedCatalog(validateCatalog(c));assert.ok(!p.aircraft.some(a=>a.id===c.aircraft[0].id));assert.ok(!p.associations.some(a=>a.id===c.associations[2].id));assert.ok(!JSON.stringify(p).includes('PRIVATE'));
});
test('historical and reported-charter associations cannot authorize live discovery',()=>{
 const c=structuredClone(source);c.associations.forEach(a=>a.status='HISTORICAL');assert.equal(liveCandidates(c).length,0);
 c.associations.forEach(a=>{a.status='VERIFIED';a.associationType='REPORTED_CHARTER';});assert.equal(liveCandidates(c).length,0);
});
test('90-day review queue preserves records and honors last verification date',()=>{
 const c=structuredClone(source),a=c.associations[0];a.verifiedAt='2020-01-01';a.lastVerifiedAt='2026-01-01';const before=JSON.stringify(c);
 assert.ok(!associationReviewQueue(c,Date.parse('2026-03-31')).some(r=>r.id===a.id));assert.ok(associationReviewQueue(c,Date.parse('2026-04-01')).some(r=>r.id===a.id));assert.equal(JSON.stringify(c),before);
});
test('charter identifiers have bounded seasons and are not physical aircraft IDs',()=>{
 const r={...source.associations[0],id:'charter-test',entityId:'new-england-patriots',callsignOrFlightNumber:'DL8863',season:'2026',validFrom:'2026-01-01',validTo:'2027-01-01',status:'UNVERIFIED'};
 assert.equal(validateCharters([r],source).length,1);assert.throws(()=>validateCharters([{...r,validTo:null}],source));assert.throws(()=>validateCharters([r,r],source));
});
test('methodology is public, source linked and included in the sitemap',()=>{
 const p=publicPage(new URL('https://skyvvard.com/methodology/'));assert.equal(p.status,200);assert.match(p.body,/90 days/);assert.match(p.body,/odbl/);assert.match(publicPage(new URL('https://skyvvard.com/sitemap.xml'),{SKYWARD_PUBLIC_ORIGIN:'https://skyvvard.com'}).body,/methodology/);
});

test('seeds must explicitly state verification and association review date',()=>{
 for(const [key,field] of [['aircraft','status'],['associations','status'],['associations','lastVerifiedAt']]){
  const incomplete=structuredClone(seed);delete incomplete[key][0][field];
  assert.throws(()=>importAirframeSeed(source,incomplete),/explicit verification status/);
 }
});

test('historical airframes and expired associations are separate from current collections',async()=>{
 const {entityAircraftGroups}=await import('../src/lib/notableDirectory.ts');
 const c=structuredClone(source),id=seed.entities[0].id;
 assert.equal(entityAircraftGroups(c,id).current.length,2);
 const association=c.associations.find(s=>s.entityId===id);association.validTo='2020-01-01';
 const groups=entityAircraftGroups(c,id);
 assert.equal(groups.current.length,1);assert.equal(groups.history.length,1);
 assert.equal(groups.history[0].id,association.aircraftId);
 c.aircraft.find(a=>a.id===groups.current[0].id).status='HISTORICAL';
 assert.equal(entityAircraftGroups(c,id).current.length,0);
});

test('page-local track is bounded and rejects duplicate, older and invalid fixes',async()=>{
 const {appendAirframeTrack}=await import('../src/lib/airframeTrack.ts');
 const point={hex:'abcdef',registration:'TEST',lat:39,lon:-77,observedAt:1};
 let rows=[];for(let i=1;i<=65;i++)rows=appendAirframeTrack(rows,{...point,observedAt:i});
 assert.equal(rows.length,60);assert.equal(rows[0].observedAt,6);
 assert.equal(appendAirframeTrack(rows,{...point,observedAt:65}),rows);
 assert.equal(appendAirframeTrack(rows,point),rows);
 assert.equal(appendAirframeTrack(rows,{...point,observedAt:66,lat:NaN}),rows);
 assert.equal(appendAirframeTrack(rows,null),rows);
});
