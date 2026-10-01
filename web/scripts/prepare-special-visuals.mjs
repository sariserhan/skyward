/** Resolve reviewed catalog descriptions to visual types, never infer paint from a team name. */
import {readFile,writeFile} from 'node:fs/promises';
import {eligibleLiveCandidates} from '../src/lib/liveCollections.ts';
import {identityAt} from '../src/lib/airframeCatalog.ts';
import {sourcedModel} from '../src/lib/sourcedModels.ts';
const c=JSON.parse(await readFile(new URL('../data/airframe-catalog.json',import.meta.url)));
const types={'767-323':'B763','737-9 MAX':'B39M','A320-232':'A320','DHC-6-300 Twin Otter':'DHC6','EC135':'EC35','208 Amphibian Caravan':'C208','737-200':'B732','737-700':'B737','E175':'E75L','A319':'A319','A320neo':'A20N','787-9':'B789','A380':'A388','A330-300':'A333','737-800':'B738','737 MAX 8':'B38M','A330-200':'A332','A320':'A320','A321':'A321','737 MAX 9':'B39M','777-300ER':'B77W','A350-900':'A359','A330-900':'A339','767-300ER':'B763','A321neo':'A21N','787-10':'B78X','777-200ER':'B772','A220-300':'BCS3'};
const operators={'JetBlue':'JBU','JetBlue Airways':'JBU','Alaska Airlines':'ASA','Delta Air Lines':'DAL','Turkish Airlines':'THY','Qantas Group':'QFA','ANA':'ANA','Qatar Airways':'QTR','Emirates':'UAE','LATAM':'TAM','Volaris':'VOI','Vueling':'VLG','Garuda Indonesia':'GIA','China Airlines':'CAL'};
const rows=eligibleLiveCandidates(c).map(a=>{const r=identityAt(a,'registrations'),type=types[a.model]??null,m=type?sourcedModel(type):null;return {aircraftId:a.id,registration:r.value,validFrom:r.validFrom,validTo:r.validTo,icaoType:type,operatorCode:operators[a.operator]??null,modelLabel:[a.manufacturer,a.model].join(' '),modelMatch:m?.match??'fallback',modelUri:m?.uri??null,designSource:a.sources[0].sourceUrl,exactLivery:false};});
await writeFile(new URL('../data/special-aircraft-visuals.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify({specialAircraft:rows.length,type:rows.filter(r=>r.modelMatch==='type').length,family:rows.filter(r=>r.modelMatch==='family').length,fallback:rows.filter(r=>r.modelMatch==='fallback').length,exactLiveries:0}));
