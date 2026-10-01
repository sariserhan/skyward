/** Editorial context only. Never joined to telemetry, search, follows or alerts. */
export type AircraftContext={id:string;personName:string;aircraftDescription:string;relationship:'CURRENT'|'HISTORICAL'|'UNKNOWN';status:'VERIFIED'|'HISTORICAL'|'UNVERIFIED';confidence:'HIGH'|'MEDIUM'|'LOW';sourceUrl:string;sourceName:string;lastVerifiedAt:string;validFrom:string|null;validTo:string|null};
export function validateAircraftContext(input:unknown):{version:1;associations:AircraftContext[]}{
 const c=input as {version:1;associations:AircraftContext[]};
 if(!c||c.version!==1||!Array.isArray(c.associations)||c.associations.length>500||JSON.stringify(c).length>262144)throw Error('Invalid contextual association dataset.');
 const keys=['id','personName','aircraftDescription','relationship','status','confidence','sourceUrl','sourceName','lastVerifiedAt','validFrom','validTo'];
 const ids=new Set<string>(),date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 for(const r of c.associations){
  if(!r||Object.keys(r).some(k=>!keys.includes(k))||!/^[a-z][a-z0-9-]{1,63}$/.test(r.id)||ids.has(r.id))throw Error('Invalid contextual identity or forbidden field.');ids.add(r.id);
  for(const key of ['personName','aircraftDescription','sourceName'] as const)if(typeof r[key]!=='string'||!r[key].trim()||r[key].length>200||/[\u0000-\u001f]/.test(r[key]))throw Error('Context requires a bounded name, aircraft description and source.');
  if(!['CURRENT','HISTORICAL','UNKNOWN'].includes(r.relationship)||!['VERIFIED','HISTORICAL','UNVERIFIED'].includes(r.status)||!['HIGH','MEDIUM','LOW'].includes(r.confidence))throw Error('Context requires explicit relationship, verification and confidence.');
  if(!date(r.lastVerifiedAt)||(r.validFrom!==null&&!date(r.validFrom))||(r.validTo!==null&&!date(r.validTo))||(r.validFrom&&r.validTo&&r.validFrom>r.validTo))throw Error('Invalid contextual evidence dates.');
  const u=new URL(r.sourceUrl);if(u.protocol!=='https:'||u.username||u.password||r.sourceUrl.length>1000)throw Error('Context requires an HTTPS source.');
 }
 return c;
}
