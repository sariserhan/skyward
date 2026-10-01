import type {Evidence,Catalog} from './airframeCatalog.ts';
export type CharterAssociation=Evidence&{id:string;entityId:string;callsignOrFlightNumber:string;season:string;validFrom:string;validTo:string;status:'VERIFIED'|'HISTORICAL'|'UNVERIFIED'};
/** Editorial charter records are separate from physical aircraft identities. */
export function validateCharters(input:unknown,c:Catalog):CharterAssociation[]{
 if(!Array.isArray(input)||input.length>500)throw Error('Charter list must contain at most 500 records.');
 const ids=new Set();
 const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 for(const r of input){
  if(!r||typeof r.id!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(r.id)||ids.has(r.id)||!c.entities.some(e=>e.id===r.entityId&&e.entityType!=='PERSON'))throw Error('Invalid charter identity.');ids.add(r.id);
  if(typeof r.callsignOrFlightNumber!=='string'||!/^[A-Z0-9]{2,10}$/.test(r.callsignOrFlightNumber)||typeof r.season!=='string'||!r.season.trim()||r.season.length>80)throw Error('Charter requires a callsign and season.');
  if(!date(r.validFrom)||!date(r.validTo)||r.validFrom>=r.validTo||!date(r.verifiedAt))throw Error('Charter requires bounded validity and verification dates.');
  if(!['HIGH','MEDIUM','LOW'].includes(r.confidence)||!['VERIFIED','HISTORICAL','UNVERIFIED'].includes(r.status)||typeof r.sourceName!=='string'||!r.sourceName.trim()||r.sourceName.length>160)throw Error('Charter requires evidence.');
  const u=new URL(r.sourceUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error('Invalid charter source.');
 }
 return input;
}
