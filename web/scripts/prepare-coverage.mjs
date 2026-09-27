import {readFile,writeFile} from 'node:fs/promises';
import catalog from '../data/airport-catalog.json' with {type:'json'};
const rows=[];
for(const [id,a] of Object.entries(catalog)){
 const g=JSON.parse(await readFile(new URL(`../public/data/airports/${id}.json`,import.meta.url)));
 rows.push({id,name:a.name,city:a.city,country:a.country,icao:a.icao,runways:g.runways.length,terminals:g.surfaces.filter(s=>s.kind==='terminal').length,buildings:g.surfaces.filter(s=>s.kind!=='apron').length,gates:g.gates.length,coverage:g.coverage,directoryDate:a.retrievedAt,facilityDate:g.osm?.retrievedAt??(['IAD','IST'].includes(id)?'2026-09-26':null),source:g.source,sourceUrl:a.sourceUrl,omittedComplexFeatures:g.osm?.omittedComplexFeatures??null});
}
await writeFile(new URL('../public/data/coverage.json',import.meta.url),JSON.stringify(rows));
console.log(`Prepared coverage metadata for ${rows.length} airports`);
