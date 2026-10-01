import {readFile,writeFile} from 'node:fs/promises';
import {importAirframeSeed} from '../src/lib/airframeSeed.ts';
const [seedPath,output]=process.argv.slice(2);
if(!seedPath||!output)throw Error('Usage: node scripts/seed-airframes.mjs <seed.json> <new-review-draft.json>');
const current=JSON.parse(await readFile(new URL('../data/airframe-catalog.json',import.meta.url)));
const raw=await readFile(seedPath,'utf8');if(Buffer.byteLength(raw)>1024*1024)throw Error('Seed exceeds 1 MiB');
const next=importAirframeSeed(current,JSON.parse(raw));
await writeFile(output,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
console.log('Validated additive seed draft written. No publication or remote calls. Review then use catalog:import.');
