/** Explicit local publication: never accepts browser-supplied production mutations. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateCatalog,validateCatalogTransition} from '../src/lib/airframeCatalog.ts';
const [path,actor]=process.argv.slice(2);if(!path||!actor||actor.length>100)throw Error('Usage: node scripts/import-airframes.mjs <reviewed-export.json> <reviewer-name>');
const target=new URL('../data/airframe-catalog.json',import.meta.url),previous=await readFile(target,'utf8'),before=JSON.parse(previous),input=await readFile(path,'utf8');
if(Buffer.byteLength(input)>1024*1024)throw Error('Catalog exceeds 1 MiB');const next=validateCatalog(JSON.parse(input));
// Existing IDs are permanent; archive, merge, or amend records instead of deleting follows.
validateCatalogTransition(before,next);
if(JSON.stringify(before)===JSON.stringify(next)){console.log('No changes.');process.exit(0);}
const after=JSON.stringify(next,null,2)+'\n',hash=s=>createHash('sha256').update(s).digest('hex');
await mkdir(new URL('../data/airframe-audit/',import.meta.url),{recursive:true});
const event={actor,action:'CATALOG_REVIEWED',createdAt:new Date().toISOString(),beforeHash:hash(previous),afterHash:hash(after),before,after:next};
// Audit is a local version-controlled artifact, never part of the public bundle.
await writeFile(new URL(`../data/airframe-audit/${Date.now()}-${hash(after).slice(0,8)}.json`,import.meta.url),JSON.stringify(event,null,2),{flag:'wx'});
await writeFile(new URL('../data/airframe-catalog.next',import.meta.url),after);await rename(new URL('../data/airframe-catalog.next',import.meta.url),target);
console.log('Catalog updated locally with before/after audit. Review git diff, test, then deploy through the normal release.');
