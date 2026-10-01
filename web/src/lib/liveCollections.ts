import {identityAt, observedStatus, type Catalog} from './airframeCatalog.ts';
import type {Aircraft} from '../types';

/** Match observed aircraft, never infer a person's presence or reuse historical identities. */
export function liveCollections(c:Catalog, observations:Aircraft[], now:number){
 const day=new Date(now).toISOString().slice(0,10);
 const active=new Map<string,Aircraft>();
 for(const row of observations){
  if(observedStatus(row,now)!=='Airborne'||row.lat===null||row.lon===null||!Number.isFinite(row.lat)||!Number.isFinite(row.lon))continue;
  const hex=row.hex.toLowerCase(),prior=active.get(hex);
  if(!prior||(row.observedAt??0)>(prior.observedAt??0))active.set(hex,row);
 }
 return c.aircraft.flatMap(a=>{
  if(a.retired||a.mergedInto)return [];
  const identity=identityAt(a,'icaoIdentities',day),registration=identityAt(a,'registrations',day);
  const row=identity&&active.get(identity.value);
  if(!row||(row.registration&&registration&&row.registration.toUpperCase()!==registration.value))return [];
  const entities=liveAssociations(c,a.id,day);
  return entities.length?[{aircraft:row,names:entities.map(e=>e.displayName).join(' · ')}]:[];
 });
}

function liveAssociations(c:Catalog,id:string,day:string){return c.entities.filter(e=>!e.archived&&e.entityType!=='PERSON'&&e.entityType!=='HISTORIC'&&c.associations.some(s=>s.aircraftId===id&&s.entityId===e.id&&s.reviewed&&!s.archived&&s.confidence!=='LOW'&&s.associationType!=='FORMERLY_ASSOCIATED'&&(!s.validFrom||s.validFrom<=day)&&(!s.validTo||day<s.validTo)));}
export function liveCandidates(c:Catalog,now=Date.now()){const day=new Date(now).toISOString().slice(0,10);return c.aircraft.filter(a=>!a.retired&&!a.mergedInto&&identityAt(a,'icaoIdentities',day)&&identityAt(a,'registrations',day)&&liveAssociations(c,a.id,day).length).slice(0,10);}
