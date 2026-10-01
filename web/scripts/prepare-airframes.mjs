import {eligibleLiveCandidates} from '../src/lib/liveCollections.ts';
import {identityAt} from '../src/lib/airframeCatalog.ts';
import {validateAircraftContext} from '../src/lib/aircraftContext.ts';
import {validateCharters} from '../src/lib/charterAssociations.ts';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {validateCatalog,publishedCatalog} from '../src/lib/airframeCatalog.ts';
const input=new URL('../data/airframe-catalog.json',import.meta.url);
const c=validateCatalog(JSON.parse(await readFile(input,'utf8')));
validateCharters(JSON.parse(await readFile(new URL('../data/charter-associations.json',import.meta.url),'utf8')),c);
validateAircraftContext(JSON.parse(await readFile(new URL('../data/aircraft-context-associations.json',import.meta.url),'utf8')));
const out=publishedCatalog(c);
await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/data/airframes.json',import.meta.url),JSON.stringify(out));
console.log(`Published ${out.aircraft.length} airframes and ${out.associations.length} reviewed associations; no remote requests.`);

// Small shared route index; no full catalog in the globe's initial bundle.
const routes=[];
for(const a of eligibleLiveCandidates(out)){
 const registration=identityAt(a,'registrations').value;
 for(const s of out.associations.filter(s=>s.aircraftId===a.id&&s.status!=='HISTORICAL'&&!s.archived&&s.reviewed&&s.confidence!=='LOW'&&!['FORMERLY_ASSOCIATED','HISTORIC_ASSOCIATION','REPORTED_CHARTER'].includes(s.associationType)&&(!s.validFrom||s.validFrom<=new Date().toISOString().slice(0,10))&&(!s.validTo||new Date().toISOString().slice(0,10)<s.validTo))){
  const e=out.entities.find(e=>e.id===s.entityId);
  if(!e||['PERSON','HISTORIC'].includes(e.entityType))continue;
  routes.push({path:`/${e.slug}/${registration.toLowerCase()}/`,aircraftId:a.id,registration,entityId:e.id,name:e.displayName,relationship:a.category});
 }
}
await writeFile(new URL('../data/special-aircraft-routes.json',import.meta.url),JSON.stringify(routes,null,2)+'\n');
