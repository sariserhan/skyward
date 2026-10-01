import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../data/airframe-catalog.json' with {type:'json'};
import manifest from '../data/global-notables-20261001.json' with {type:'json'};
import {publishedCatalog,validateCatalog,identityAt} from '../src/lib/airframeCatalog.ts';
import {directoryMatches,entityAircraftGroups,isNotableAircraft} from '../src/lib/notableDirectory.ts';
import {eligibleLiveCandidates,liveCandidates,liveCollections} from '../src/lib/liveCollections.ts';
const c=publishedCatalog(validateCatalog(source)),now=Date.parse('2026-10-01T12:00:00Z');
test('over 100 featured aircraft exclude ordinary fleets and historical identities',()=>{
 const featured=eligibleLiveCandidates(c,now);
 assert.ok(featured.length>100);
 assert.ok(featured.every(a=>isNotableAircraft(a)&&identityAt(a,'registrations','2026-10-01')));
 assert.equal(c.aircraft.filter(a=>!isNotableAircraft(a)).length,97);
 assert.ok(!featured.some(a=>a.id==='alaska-giants-855'));
 assert.ok(!directoryMatches(c,'','All').some(e=>e.id==='finnair'));
 assert.ok(directoryMatches(c,'','Airline fleets').some(e=>e.id==='finnair'));
 assert.equal(entityAircraftGroups(c,'icelandair','All').current.length,0);
 assert.equal(entityAircraftGroups(c,'icelandair','Airline fleets').current.length,21);
});
test('global additions have traceable relationships across seven regional groups',()=>{
 assert.deepEqual([...new Set(manifest.aircraft.map(a=>a.region))].sort(),['Africa','Asia','Europe','Middle East','North America','Oceania','South America'].sort());
 assert.equal(new Set(manifest.aircraft.map(a=>a.aircraftId)).size,manifest.aircraft.length);
 for(const entry of manifest.aircraft){
  const a=c.aircraft.find(a=>a.id===entry.aircraftId),s=c.associations.find(s=>s.aircraftId===entry.aircraftId);
  assert.ok(a&&s);assert.equal(a.registrations[0].value,entry.registration);
  assert.equal(s.sourceUrl,entry.sourceUrl);assert.equal(s.associationType,entry.relationship);
  assert.ok(s.reviewed&&s.lastVerifiedAt);assert.equal(a.icaoIdentities.length,0);
  assert.equal(c.entities.find(e=>e.id===s.entityId).entityType==='PERSON',false);
  if(s.associationType==='BRANDED_LIVERY')assert.match(s.context,/not ownership/);
 }
});
test('ordinary airline matches require explicit opt-in while branded aircraft remain discoverable',()=>{
 const base={hex:'abcdef',ground:false,observedAt:now,lat:40,lon:10};
 const ordinary={...base,registration:'OH-LKE'};
 assert.equal(liveCollections(c,[ordinary],now).length,0);
 assert.equal(liveCollections(c,[ordinary],now,true).length,1);
 const branded={...base,registration:'A6-BND'};
 assert.match(liveCollections(c,[branded],now)[0].names,/Manchester City/);
 assert.equal(liveCollections(c,[{...branded,ground:true}],now).length,0);
 assert.equal(liveCollections(c,[{...branded,observedAt:now-120001}],now).length,0);
 assert.equal(liveCollections(c,[{...branded,simulation:{}}],now).length,0);
 assert.ok(liveCandidates(c,now).length<=10);
 assert.ok(liveCandidates(c,now,'finnair').every(a=>!isNotableAircraft(a)));
});

test('indexed associations deduplicate names and preserve withdrawal and date gates',()=>{
 const d=structuredClone(c),s=d.associations.find(s=>s.entityId==='manchester-city');
 d.associations.push({...s,id:'duplicate-manchester-source'});
 const row={hex:'abcdef',registration:'A6-BND',lat:30,lon:50,observedAt:now,ground:false};
 assert.equal(liveCollections(d,[row],now)[0].names,'Manchester City');
 for(const change of [s=>s.archived=true,s=>s.reviewed=false,s=>s.validFrom='2026-10-02',s=>s.validTo='2026-10-01',s=>s.status='HISTORICAL',s=>s.associationType='REPORTED_CHARTER']){
  const next=structuredClone(c);change(next.associations.find(s=>s.entityId==='manchester-city'));
  assert.equal(liveCollections(next,[row],now).length,0);
  assert.equal(eligibleLiveCandidates(next,now,'manchester-city').length,0);
 }
});
