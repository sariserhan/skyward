/** Published airframe identity, not a callsign or an occupant identity. */
export type VerificationStatus='VERIFIED'|'HISTORICAL'|'UNVERIFIED';
export type Evidence={sourceUrl:string;sourceName:string;verifiedAt:string;confidence:'HIGH'|'MEDIUM'|'LOW'};
export type Identity=Evidence&{value:string;validFrom:string|null;validTo:string|null;country?:string};
export type Airframe={status?:VerificationStatus;id:string;manufacturer:string;model:string;variant?:string;serialNumber?:string;serialSeries?:string;operator?:string;yearBuilt?:number;category:string;retired?:boolean;registrations:Identity[];icaoIdentities:Identity[];sources:Evidence[];mergedInto?:string};
export type NotableEntity={id:string;slug:string;displayName:string;entityType:'PERSON'|'COMPANY'|'SPORTS_TEAM'|'ORGANIZATION'|'HISTORIC'|'OTHER';description:string;archived?:boolean};
export type Association=Evidence&{status?:VerificationStatus;lastVerifiedAt?:string;id:string;aircraftId:string;entityId:string;associationType:'REGISTERED_OWNER'|'OPERATOR'|'PUBLICLY_ASSOCIATED'|'BRANDED_LIVERY'|'FORMERLY_ASSOCIATED'|'TEAM_AIRCRAFT'|'CORPORATE_AIRCRAFT'|'HISTORIC_ASSOCIATION'|'REPORTED_CHARTER';validFrom:string|null;validTo:string|null;reviewed:boolean;archived?:boolean;notes?:string;context?:string};
export type Catalog={version:1;aircraft:Airframe[];entities:NotableEntity[];associations:Association[]};
export const CATALOG_LIMITS={aircraft:500,entities:100,associations:1000,bytes:1024*1024,follows:50};
const id=/^[a-z][a-z0-9-]{1,63}$/;
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const str=(v:unknown,n=160)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f]/.test(v);
function evidence(e:Evidence){check(e&&str(e.sourceName)&&['HIGH','MEDIUM','LOW'].includes(e.confidence)&&day(e.verifiedAt),'Evidence needs a source name, verification date and confidence.');let u:URL;try{u=new URL(e.sourceUrl);}catch{throw Error('Evidence needs an HTTPS source URL.');}check(u.protocol==='https:'&&!u.username&&!u.password&&e.sourceUrl.length<1000,'Evidence needs an HTTPS source URL.');}
function dates(e:{validFrom:string|null;validTo:string|null}){check((e.validFrom===null||day(e.validFrom))&&(e.validTo===null||day(e.validTo))&&(!e.validFrom||!e.validTo||e.validFrom<=e.validTo),'Invalid identity/association dates.');}
export function validateCatalog(input:unknown):Catalog{
 const c=input as Catalog;check(c&&c.version===1,'Unsupported catalog version.');check(new TextEncoder().encode(JSON.stringify(c)).length<=CATALOG_LIMITS.bytes,'Catalog exceeds the 1 MiB publication budget.');
 for(const key of ['aircraft','entities','associations'] as const){check(Array.isArray(c[key])&&c[key].length<=CATALOG_LIMITS[key],`Too many ${key}.`);const ids=new Set();for(const row of c[key]){check(row&&id.test(row.id)&&!ids.has(row.id),`Invalid or duplicate ${key} ID.`);ids.add(row.id);}}
 for(const a of c.aircraft){check(a.status===undefined||['VERIFIED','HISTORICAL','UNVERIFIED'].includes(a.status),'Invalid aircraft verification status.');check(str(a.manufacturer)&&str(a.model)&&str(a.category),'Aircraft manufacturer, model and category are required.');for(const k of ['variant','serialNumber','serialSeries','operator'] as const)check(a[k]===undefined||str(a[k]),`Invalid ${k}.`);check(a.yearBuilt===undefined||Number.isInteger(a.yearBuilt)&&a.yearBuilt>=1900&&a.yearBuilt<=2100,'Invalid build year.');check(Array.isArray(a.sources)&&a.sources.length>0&&a.sources.length<=10,'Aircraft needs 1–10 sources.');a.sources.forEach(evidence);
  for(const k of ['registrations','icaoIdentities'] as const){check(Array.isArray(a[k])&&a[k].length<=30,'Too many historical identifiers.');for(const r of a[k]){evidence(r);dates(r);check((k==='registrations'?/^[A-Z0-9-]{2,12}$/:/^[a-f0-9]{6}$/).test(r.value),'Invalid registration or ICAO address.');}}
  if(a.mergedInto)check(a.mergedInto!==a.id&&c.aircraft.some(x=>x.id===a.mergedInto),'Merge destination is invalid.');
 }
 for(const a of c.aircraft)canonicalId(c,a.id);
 const slugs=new Set();for(const e of c.entities){check(str(e.displayName)&&str(e.description,1000)&&id.test(e.slug)&&!slugs.has(e.slug)&&['PERSON','COMPANY','SPORTS_TEAM','ORGANIZATION','HISTORIC','OTHER'].includes(e.entityType),'Invalid entity or duplicate slug.');slugs.add(e.slug);}
 for(const a of c.associations){check(a.status===undefined||['VERIFIED','HISTORICAL','UNVERIFIED'].includes(a.status),'Invalid association verification status.');check(a.lastVerifiedAt===undefined||day(a.lastVerifiedAt),'Invalid last verification date.');evidence(a);dates(a);check(c.aircraft.some(x=>x.id===a.aircraftId)&&c.entities.some(x=>x.id===a.entityId),'Association references an unknown aircraft/entity.');check(['REGISTERED_OWNER','OPERATOR','PUBLICLY_ASSOCIATED','BRANDED_LIVERY','FORMERLY_ASSOCIATED','TEAM_AIRCRAFT','CORPORATE_AIRCRAFT','HISTORIC_ASSOCIATION','REPORTED_CHARTER'].includes(a.associationType)&&typeof a.reviewed==='boolean','Association type and review decision required.');check(a.notes===undefined||str(a.notes,1000),'Notes too long.');check(a.context===undefined||str(a.context,500),'Association context too long.');}
 return c;
}
export function canonicalId(c:Catalog,value:string){const visited=new Set<string>();let a=c.aircraft.find(a=>a.id===value);if(!a)throw Error('Unknown aircraft ID.');while(a.mergedInto){check(!visited.has(a.id),'Circular aircraft merge.');visited.add(a.id);a=c.aircraft.find(x=>x.id===a!.mergedInto);if(!a)throw Error('Missing merge destination.');}return a.id;}
export function validAt(r:Identity,at:string){return (!r.validFrom||r.validFrom<=at)&&(!r.validTo||at<r.validTo);}
export function identityAt(a:Airframe,kind:'registrations'|'icaoIdentities',at=new Date().toISOString().slice(0,10)){const rows=a[kind].filter(r=>validAt(r,at)&&r.confidence==='HIGH');return rows.length===1?rows[0]:undefined;}
export function resolveAirframe(c:Catalog,q:{serialNumber?:string;manufacturer?:string;serialSeries?:string;registration?:string;icaoHex?:string;at?:string}){
 const at=q.at??new Date().toISOString().slice(0,10),norm=(s?:string)=>s?.trim().toUpperCase();
 const strong=!!q.serialNumber&&!!q.manufacturer,good=!!q.registration&&!!q.icaoHex;
 const serialMatch=(a:Airframe)=>norm(a.serialNumber)===norm(q.serialNumber)&&norm(a.manufacturer)===norm(q.manufacturer)&&norm(a.serialSeries)===norm(q.serialSeries);
 const identifierMatch=(a:Airframe)=>!!(q.registration&&a.registrations.some(r=>r.confidence==='HIGH'&&norm(r.value)===norm(q.registration)&&validAt(r,at))||q.icaoHex&&a.icaoIdentities.some(r=>r.confidence==='HIGH'&&norm(r.value)===norm(q.icaoHex)&&validAt(r,at)));
 const conflict=strong&&c.aircraft.some(a=>!a.mergedInto&&identifierMatch(a)&&a.serialNumber&&!serialMatch(a));
 const candidates=conflict?[]:c.aircraft.filter(a=>!a.mergedInto&&(strong?serialMatch(a):(!q.registration||a.registrations.some(r=>r.confidence==='HIGH'&&norm(r.value)===norm(q.registration)&&validAt(r,at)))&&(!q.icaoHex||a.icaoIdentities.some(r=>r.confidence==='HIGH'&&norm(r.value)===norm(q.icaoHex)&&validAt(r,at)))));

 return {aircraftId:(strong||good)&&candidates.length===1?candidates[0].id:null,confidence:strong&&candidates.length===1?'HIGH':good&&candidates.length===1?'MEDIUM':'LOW',candidates:candidates.map(a=>a.id)};
}
export function publishedCatalog(c:Catalog):Catalog{
 // Public artifacts cannot contain speculative/private associations or editorial notes.
 const entities=c.entities.filter(e=>!e.archived&&e.entityType!=='PERSON').map(({id,slug,displayName,entityType,description})=>({id,slug,displayName,entityType,description}));
 const cleanEvidence=(e:Evidence)=>({sourceUrl:e.sourceUrl,sourceName:e.sourceName,verifiedAt:e.verifiedAt,confidence:e.confidence});
 const aircraft=c.aircraft.filter(a=>a.status!=='UNVERIFIED'&&c.aircraft.find(t=>t.id===canonicalId(c,a.id))!.status!=='UNVERIFIED'&&a.sources.some(s=>s.confidence!=='LOW')&&c.aircraft.find(t=>t.id===canonicalId(c,a.id))!.sources.some(s=>s.confidence!=='LOW')).map(a=>({status:a.status??(a.retired?'HISTORICAL':'VERIFIED'),id:a.id,manufacturer:a.manufacturer,model:a.model,variant:a.variant,serialNumber:a.serialNumber,serialSeries:a.serialSeries,operator:a.operator,yearBuilt:a.yearBuilt,category:a.category,retired:a.retired,mergedInto:a.mergedInto?canonicalId(c,a.id):undefined,sources:a.sources.filter(e=>e.confidence!=='LOW').map(cleanEvidence),registrations:a.registrations.filter(e=>e.confidence!=='LOW').map(e=>({...cleanEvidence(e),value:e.value,validFrom:e.validFrom,validTo:e.validTo,country:e.country})),icaoIdentities:a.icaoIdentities.filter(e=>e.confidence!=='LOW').map(e=>({...cleanEvidence(e),value:e.value,validFrom:e.validFrom,validTo:e.validTo}))}));
 const associations=c.associations.filter(a=>a.status!=='UNVERIFIED'&&!a.archived&&a.reviewed&&a.confidence!=='LOW'&&aircraft.some(x=>x.id===a.aircraftId)&&entities.some(e=>e.id===a.entityId)).map(a=>({...cleanEvidence(a),status:a.status??(['FORMERLY_ASSOCIATED','HISTORIC_ASSOCIATION'].includes(a.associationType)?'HISTORICAL':'VERIFIED'),lastVerifiedAt:a.lastVerifiedAt??a.verifiedAt,id:a.id,aircraftId:a.aircraftId,entityId:a.entityId,associationType:a.associationType,validFrom:a.validFrom,validTo:a.validTo,context:a.context,reviewed:true}));
 return {version:1,aircraft,entities,associations};
}
export function catalogSearch(c:Catalog,query:string){const q=query.trim().toLowerCase().replace(/^serial\s+/,'');return c.aircraft.filter(a=>!a.mergedInto&&[a.manufacturer,a.model,a.variant,a.serialNumber,a.operator,...a.registrations.map(r=>r.value),...a.icaoIdentities.map(r=>r.value)].some(s=>s?.toLowerCase().includes(q))).slice(0,50);}
export function normalizedFollows(c:Catalog,ids:string[],preserveUnavailable=false){check(Array.isArray(ids)&&ids.length<=CATALOG_LIMITS.follows,'Follow up to 50 aircraft.');return [...new Set(ids.map(value=>{check(typeof value==='string'&&id.test(value),'Invalid aircraft ID.');return preserveUnavailable&&!c.aircraft.some(a=>a.id===value)?value:canonicalId(c,value);}))].sort();}
export function observedStatus(row:{observedAt?:number|null;ground?:boolean;simulation?:unknown}|null,now=Date.now()){
 if(!row||row.simulation||!Number.isFinite(row.observedAt)||row.observedAt!>now+30000)return 'Unknown';
 return now-row.observedAt!>120000?'Last detected · stale':row.ground===true?'Ground':row.ground===false?'Airborne':'Observed · status unknown';
}
export function mergeAirframes(c:Catalog,fromId:string,toId:string):Catalog{
 check(fromId!==toId,'Choose two different aircraft.');const from=c.aircraft.find(a=>a.id===fromId),to=c.aircraft.find(a=>a.id===toId);check(from&&!from.mergedInto&&to&&!to.mergedInto,'Choose two active aircraft records.');
 check(from!.serialNumber&&from!.serialNumber===to!.serialNumber&&from!.manufacturer===to!.manufacturer&&from!.serialSeries===to!.serialSeries,'Merges require matching manufacturer, serial series and serial number.');
 const next=structuredClone(c),target=next.aircraft.find(a=>a.id===toId)!;for(const key of ['registrations','icaoIdentities'] as const)target[key]=[...new Map([...target[key],...from![key]].map(r=>[JSON.stringify(r),r])).values()];next.aircraft.find(a=>a.id===fromId)!.mergedInto=toId;return validateCatalog(next);
}
/** Publication cannot reuse a followed ID for a different physical airframe. */
export function validateCatalogTransition(before:Catalog,next:Catalog){
 validateCatalog(next);
 for(const prior of before.aircraft){const after=next.aircraft.find(a=>a.id===prior.id);check(after,`Aircraft ID ${prior.id} must be retained or merged, never deleted.`);
  if(prior.serialNumber)check(after!.serialNumber===prior.serialNumber&&after!.manufacturer===prior.manufacturer&&after!.serialSeries===prior.serialSeries,'An established physical identity cannot be overwritten. Flag the conflict for review.');
  if(after!.mergedInto&&!prior.mergedInto){const target=next.aircraft.find(a=>a.id===canonicalId(next,after!.mergedInto!));check(prior.serialNumber&&target?.serialNumber===prior.serialNumber&&target.manufacturer===prior.manufacturer&&target.serialSeries===prior.serialSeries,'A merge requires manufacturer-scoped serial evidence.');}
  if(prior.mergedInto)check(canonicalId(before,prior.id)===canonicalId(next,prior.id)||next.aircraft.find(a=>a.id===canonicalId(before,prior.id))?.mergedInto,'A published merge cannot silently be undone or retargeted.');
 }
 return next;
}
