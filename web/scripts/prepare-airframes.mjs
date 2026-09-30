import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {validateCatalog,publishedCatalog} from '../src/lib/airframeCatalog.ts';
const input=new URL('../data/airframe-catalog.json',import.meta.url);
const c=validateCatalog(JSON.parse(await readFile(input,'utf8')));
const out=publishedCatalog(c);
await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/data/airframes.json',import.meta.url),JSON.stringify(out));
console.log(`Published ${out.aircraft.length} airframes and ${out.associations.length} reviewed associations; no remote requests.`);
