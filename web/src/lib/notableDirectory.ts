import {canonicalId,type Airframe,type Catalog,type NotableEntity} from './airframeCatalog.ts';
export const directoryCategories=['All','Sports','Business & aviation','Public service','Historic'] as const;
export type DirectoryCategory=typeof directoryCategories[number];
export const aircraftLabel=(a:Airframe)=>a.registrations.at(-1)?.value??a.id;
export function entityAircraft(c:Catalog,id:string){const ids=new Set(c.associations.filter(s=>s.entityId===id).map(s=>canonicalId(c,s.aircraftId)));return c.aircraft.filter(a=>!a.mergedInto&&ids.has(a.id));}
export function directoryMatches(c:Catalog,query:string,category:DirectoryCategory){
 const q=query.trim().toLocaleLowerCase();return c.entities.filter(e=>{
  const rows=entityAircraft(c,e.id);if(!rows.length||e.archived||e.entityType==='PERSON')return false;
  const categoryMatch=category==='All'||category==='Sports'&&e.entityType==='SPORTS_TEAM'||category==='Business & aviation'&&e.entityType==='COMPANY'||category==='Public service'&&e.entityType==='ORGANIZATION'||category==='Historic'&&(e.entityType==='HISTORIC'||rows.some(a=>a.retired||a.category==='Historic aircraft'));
  return categoryMatch&&[e.displayName,e.description,...rows.flatMap(a=>[a.manufacturer,a.model,a.variant,a.operator,a.serialNumber,...a.registrations.map(r=>r.value),...a.icaoIdentities.map(r=>r.value)])].filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
 }).sort((a,b)=>a.displayName.localeCompare(b.displayName));
}
export const entityTypeLabel=(e:NotableEntity)=>({SPORTS_TEAM:'Sports',COMPANY:'Business & aviation',ORGANIZATION:'Public service',HISTORIC:'Historic',OTHER:'Special aircraft',PERSON:'Unpublished'})[e.entityType];
