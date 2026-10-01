import {validateCatalog,validateCatalogTransition,type Catalog} from './airframeCatalog.ts';
import {reviewIdentities} from './airframeReview.ts';
/** Additive import: never overwrite evidence or choose between ambiguous identities. */
export function importAirframeSeed(current:Catalog,input:unknown):Catalog{
 const seed=validateCatalog(input),next=structuredClone(current);
 if(seed.aircraft.some(a=>!a.status)||seed.associations.some(a=>!a.status||!a.lastVerifiedAt))throw Error('Every seed requires an explicit verification status; associations also require lastVerifiedAt.');
 for(const key of ['aircraft','entities','associations'] as const){
  for(const row of seed[key]){
   const prior=next[key].find(a=>a.id===row.id);
   if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error(`Seed conflicts with existing ${key} ${row.id}; use the reviewed catalog editor.`);continue;}
   (next[key] as {id:string}[]).push(structuredClone(row));
  }
 }
 validateCatalogTransition(current,next);
 const before=new Set(reviewIdentities(current).map(i=>`${i.left}/${i.right}`));
 if(reviewIdentities(next).some(i=>!before.has(`${i.left}/${i.right}`)))throw Error('Seed introduces duplicate or conflicting aircraft identity; review before import.');
 return next;
}
