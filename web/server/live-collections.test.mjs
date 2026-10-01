import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../data/airframe-catalog.json' with {type:'json'};
import {publishedCatalog,identityAt} from '../src/lib/airframeCatalog.ts';
import {liveCollections} from '../src/lib/liveCollections.ts';
const c=publishedCatalog(source),now=Date.parse('2026-10-01T12:00:00Z');
const a=c.aircraft.find(a=>a.registrations.some(r=>r.value==='N36NE'));
const row={hex:identityAt(a,'icaoIdentities','2026-10-01').value,registration:'N36NE',callsign:'TEST',observedAt:now,ground:false,lat:40,lon:-70};
test('only recent airborne observed organizational aircraft appear',()=>{
 assert.match(liveCollections(c,[row],now)[0].names,/Patriots/);
 for(const patch of [{ground:true},{observedAt:now-120001},{observedAt:now+31000},{simulation:{}},{lat:null},{hex:'ffffff'},{registration:'OTHER'}])assert.equal(liveCollections(c,[{...row,...patch}],now).length,0);
 assert.equal(liveCollections(c,[row,row],now).length,1);
});
test('retired, historical associations and personal collections cannot become live entries',()=>{
 for(const change of [d=>d.aircraft.find(x=>x.id===a.id).retired=true,d=>d.entities.forEach(e=>e.entityType='PERSON'),d=>d.associations.forEach(s=>s.validTo='2026-09-30'),d=>d.associations.forEach(s=>s.associationType='FORMERLY_ASSOCIATED')]){const d=structuredClone(c);change(d);assert.equal(liveCollections(d,[row],now).length,0);}
});
test('registration-only fleet entries require an unambiguous matching observation',()=>{
 const reg={...row,hex:'abcdef',registration:'N985AK'};
 assert.match(liveCollections(c,[reg],now)[0].names,/Alaska/);
 assert.equal(liveCollections(c,[reg,{...reg,hex:'fedcba'}],now).length,0);
 const conflict=structuredClone(c);const a=conflict.aircraft.find(a=>a.id==='alaska-seattle-world-cup-985');conflict.aircraft.push({...a,id:'different-airframe'});
 assert.equal(liveCollections(conflict,[reg],now).length,0);
 assert.equal(liveCollections(c,[{...reg,observedAt:now-121000}],now).length,0);
});
