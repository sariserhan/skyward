import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../data/airframe-catalog.json' with {type:'json'};
import {publishedCatalog,validateCatalog,identityAt} from '../src/lib/airframeCatalog.ts';
import {directoryMatches,entityAircraft} from '../src/lib/notableDirectory.ts';
const c=publishedCatalog(validateCatalog(source));
test('directory supports teams, businesses, organizations and historic aircraft without inventing occupants',()=>{
 assert.ok(directoryMatches(c,'','Sports').some(e=>e.id==='new-england-patriots'));
 assert.ok(directoryMatches(c,'','Business & aviation').some(e=>e.id==='boeing'));
 assert.ok(directoryMatches(c,'','Public service').some(e=>e.id==='orbis'));
 assert.ok(directoryMatches(c,'','Historic').some(e=>e.id==='flying-bulls'));
 assert.equal(directoryMatches(c,'N36NE','Sports')[0].id,'new-england-patriots');
 assert.equal(directoryMatches(c,'Boeing 767','Sports')[0].id,'new-england-patriots');
 assert.equal(directoryMatches(c,'N36NE','Public service').length,0);
 assert.ok(directoryMatches(c,'N996DM','All').some(e=>e.id==='flying-bulls'));
 assert.equal(directoryMatches(c,'no-such-collection','All').length,0);
 assert.equal(entityAircraft(c,'new-england-patriots').length,2);
 assert.equal(c.entities.some(e=>e.entityType==='PERSON'),false);
});
test('directory hides empty, archived and unpublished entities and deduplicates associated aircraft',()=>{
 const next=structuredClone(c);next.entities.push({id:'empty',displayName:'Empty',entityType:'COMPANY'});
 assert.ok(!directoryMatches(next,'','All').some(e=>e.id==='empty'));
 next.entities.find(e=>e.id==='new-england-patriots').archived=true;assert.equal(directoryMatches(next,'Patriots','Sports').length,0);
 const association=next.associations.find(a=>a.entityId==='flying-bulls');next.associations.push({...association,id:'duplicate'});assert.equal(entityAircraft(next,'flying-bulls').length,entityAircraft(c,'flying-bulls').length);
});
test('public context is bounded and old Giants identity cannot authorize live lookup',()=>{
 const next=structuredClone(source);next.associations[0].context='x'.repeat(501);assert.throws(()=>validateCatalog(next),/context/);
 assert.match(c.associations.find(a=>a.entityId==='san-francisco-giants').context,/2021/);
 assert.equal(identityAt(c.aircraft.find(a=>a.id==='alaska-giants-855'),'registrations'),undefined);
 assert.equal(identityAt(c.aircraft.find(a=>a.id==='flying-bulls-dc6'),'registrations').value,'OE-LDM');
});

test('expanded fleet has over 120 unique airframes with explicit operator provenance',()=>{
 assert.ok(c.aircraft.length>=120);
 const regs=c.aircraft.flatMap(a=>a.registrations.filter(r=>!r.validTo).map(r=>r.value));
 assert.equal(new Set(regs).size,regs.length);
 assert.equal(entityAircraft(c,'finnair').length,76);
 const regional=c.aircraft.find(a=>a.registrations.some(r=>r.value==='OH-LKE'));
 assert.equal(regional.operator,'Norra (Finnair services)');
 assert.equal(regional.icaoIdentities.length,0,'unverified hex must remain absent');
 assert.equal(c.associations.find(a=>a.aircraftId===regional.id).associationType,'PUBLICLY_ASSOCIATED');
});
test('large collections support disjoint ten-aircraft batches without automatic requests',async()=>{
 const {liveCandidates,eligibleLiveCandidates}=await import('../src/lib/liveCollections.ts');
 const all=eligibleLiveCandidates(c,Date.parse('2026-10-01'),'finnair');
 assert.equal(all.length,76);
 const batch1=liveCandidates(c,Date.parse('2026-10-01'),'finnair',0),batch2=liveCandidates(c,Date.parse('2026-10-01'),'finnair',10);
 assert.equal(batch1.length,10);assert.equal(batch2.length,10);
 assert.ok(batch2.every(a=>!batch1.some(b=>a.id===b.id)));
 assert.equal(liveCandidates(c,Date.parse('2026-10-01'),'finnair',70).length,6);
});
