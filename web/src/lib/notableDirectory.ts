import {canonicalId,type Airframe,type Catalog,type NotableEntity,type Association} from './airframeCatalog.ts';
export const directoryCategories=['All','Sports','Business & aviation','Public service','Historic','Business','Corporate','Entertainment','Special Aircraft'] as const;
export type DirectoryCategory=typeof directoryCategories[number];
export const aircraftLabel=(a:Airframe)=>a.registrations.at(-1)?.value??a.id;
export function entityAircraft(c:Catalog,id:string){const ids=new Set(c.associations.filter(s=>s.entityId===id).map(s=>canonicalId(c,s.aircraftId)));return c.aircraft.filter(a=>!a.mergedInto&&ids.has(a.id));}
export function directoryMatches(c:Catalog,query:string,category:DirectoryCategory){
 const q=query.trim().toLocaleLowerCase();return c.entities.filter(e=>{
  const rows=entityAircraft(c,e.id);if(!rows.length||e.archived||e.entityType==='PERSON')return false;
  const categoryMatch=category==='All'||category==='Business'&&e.entityType==='COMPANY'||category==='Corporate'&&c.associations.some(a=>a.entityId===e.id&&a.associationType==='CORPORATE_AIRCRAFT')||category==='Entertainment'&&rows.some(a=>a.category==='Entertainment')||category==='Special Aircraft'&&(e.entityType==='OTHER'||rows.some(a=>/special|research|heritage/i.test(a.category)))||category==='Sports'&&e.entityType==='SPORTS_TEAM'||category==='Business & aviation'&&e.entityType==='COMPANY'||category==='Public service'&&e.entityType==='ORGANIZATION'||category==='Historic'&&(e.entityType==='HISTORIC'||rows.some(a=>a.retired||a.category==='Historic aircraft'));
  return categoryMatch&&[e.displayName,e.description,...rows.flatMap(a=>[a.manufacturer,a.model,a.variant,a.operator,a.serialNumber,...a.registrations.map(r=>r.value),...a.icaoIdentities.map(r=>r.value)])].filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
 }).sort((a,b)=>a.displayName.localeCompare(b.displayName));
}
export const entityTypeLabel=(e:NotableEntity)=>({SPORTS_TEAM:'Sports',COMPANY:'Business & aviation',ORGANIZATION:'Public service',HISTORIC:'Historic',OTHER:'Special aircraft',PERSON:'Unpublished'})[e.entityType];

export const historicalAircraft=(a:Airframe)=>a.status==='HISTORICAL'||!!a.retired;
export const historicalAssociation=(a:Association,day=new Date().toISOString().slice(0,10))=>a.status==='HISTORICAL'||['FORMERLY_ASSOCIATED','HISTORIC_ASSOCIATION'].includes(a.associationType)||!!a.validTo&&a.validTo<=day;
export function entityAircraftGroups(c:Catalog,id:string){
 const rows=entityAircraft(c,id);
 const current=rows.filter(a=>!historicalAircraft(a)&&c.associations.some(s=>s.entityId===id&&canonicalId(c,s.aircraftId)===a.id&&!historicalAssociation(s)));
 const active=new Set(current.map(a=>a.id));return {current,history:rows.filter(a=>!active.has(a.id))};
}
