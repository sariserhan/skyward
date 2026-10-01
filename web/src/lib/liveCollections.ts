import {isNotableAircraft} from './notableDirectory.ts';
import {matchAirframeObservation} from './airframeObservations.ts';
import {identityAt, observedStatus, type Catalog,type NotableEntity} from './airframeCatalog.ts';
import type {Aircraft} from '../types';

/** Match observed aircraft, never infer a person's presence or reuse historical identities. */
export function liveCollections(c:Catalog, observations:Aircraft[], now:number, includeAirlineFleet=false){
 const day=new Date(now).toISOString().slice(0,10);
 const associations=liveAssociationIndex(c,day);
 const active=new Map<string,Aircraft>();
 for(const row of observations){
  if(observedStatus(row,now)!=='Airborne'||row.lat===null||row.lon===null||!Number.isFinite(row.lat)||!Number.isFinite(row.lon))continue;
  const hex=row.hex.toLowerCase(),prior=active.get(hex);
  if(!prior||(row.observedAt??0)>(prior.observedAt??0))active.set(hex,row);
 }
 const observationsByHex=[...active.values()];
 return c.aircraft.flatMap(a=>{
  if(!includeAirlineFleet&&!isNotableAircraft(a)||a.status==='UNVERIFIED'||a.status==='HISTORICAL'||a.retired||a.mergedInto)return [];
  const entities=associations.get(a.id);
  if(!entities?.length)return [];
  const matched=matchAirframeObservation(c,a,observationsByHex,now);
  const row=matched&&active.get(matched.hex);
  if(!row)return [];
  return [{aircraft:row,names:entities.map(e=>e.displayName).join(' · '),relationship:a.category}];
 });
}

/** Build once per evaluation; the catalog grows faster than the number of visible observations. */
function liveAssociationIndex(c:Catalog,day:string){
 const entities=new Map(c.entities.filter(e=>!e.archived&&e.entityType!=='PERSON'&&e.entityType!=='HISTORIC').map(e=>[e.id,e]));
 const index=new Map<string,NotableEntity[]>();
 for(const s of c.associations){
  const e=entities.get(s.entityId);
  if(!e||!s.reviewed||s.archived||s.status==='UNVERIFIED'||s.status==='HISTORICAL'||s.confidence==='LOW'||['HISTORIC_ASSOCIATION','REPORTED_CHARTER','FORMERLY_ASSOCIATED'].includes(s.associationType)||s.validFrom&&s.validFrom>day||s.validTo&&day>=s.validTo)continue;
  const rows=index.get(s.aircraftId)??[];
  if(!rows.some(row=>row.id===e.id))rows.push(e);
  index.set(s.aircraftId,rows);
 }
 return index;
}
export function eligibleLiveCandidates(c:Catalog,now=Date.now(),entityId=''){
 const day=new Date(now).toISOString().slice(0,10),associations=liveAssociationIndex(c,day);
 const explicitCollection=!!entityId&&entityId!=='sports'&&entityId!=='notable';
 return c.aircraft.filter(a=>(explicitCollection||isNotableAircraft(a))&&a.status!=='UNVERIFIED'&&a.status!=='HISTORICAL'&&!a.retired&&!a.mergedInto&&identityAt(a,'registrations',day)&&associations.get(a.id)?.some(e=>!entityId||entityId==='notable'||(entityId==='sports'?e.entityType==='SPORTS_TEAM':e.id===entityId)));
}
export function liveCandidates(c:Catalog,now=Date.now(),entityId='',offset=0){const start=Number.isSafeInteger(offset)&&offset>=0?offset:0;return eligibleLiveCandidates(c,now,entityId).slice(start,start+10);}
