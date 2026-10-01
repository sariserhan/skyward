import type {Catalog,Identity} from './airframeCatalog.ts';
export type IdentityIssue={left:string;right:string;kind:'DUPLICATE_CANDIDATE'|'IDENTIFIER_CONFLICT';reason:string};
const norm=(s?:string)=>s?.trim().toUpperCase();
const overlaps=(a:Identity,b:Identity)=>(!a.validTo||!b.validFrom||b.validFrom<a.validTo)&&(!b.validTo||!a.validFrom||a.validFrom<b.validTo);
/** Review suggestions, never an automatic merge or enrichment. */
export function reviewIdentities(c:Catalog):IdentityIssue[]{
 const result:IdentityIssue[]=[],rows=c.aircraft.filter(a=>!a.mergedInto);
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j],sameSerial=!!a.serialNumber&&norm(a.serialNumber)===norm(b.serialNumber)&&norm(a.manufacturer)===norm(b.manufacturer)&&norm(a.serialSeries)===norm(b.serialSeries);
  if(sameSerial)result.push({left:a.id,right:b.id,kind:'DUPLICATE_CANDIDATE',reason:'Matching manufacturer, serial series and serial number. Verify the original evidence before merging.'});
  else for(const key of ['registrations','icaoIdentities'] as const)if(a[key].some(x=>x.confidence==='HIGH'&&b[key].some(y=>y.confidence==='HIGH'&&x.value===y.value&&overlaps(x,y)))){result.push({left:a.id,right:b.id,kind:'IDENTIFIER_CONFLICT',reason:`Overlapping ${key} without matching serial evidence. Correct dates or resolve identity evidence; do not merge by identifier alone.`});break;}
  if(result.length>=100)return result;
 }
 return result;
}

/** Review dates are editorial signals, never automatic deletions. */
export function associationReviewQueue(c:Catalog,now=Date.now()){
 return c.associations.map(a=>{const date=a.lastVerifiedAt??a.verifiedAt;const ageDays=Math.floor((now-Date.parse(date))/86400000);return {id:a.id,aircraftId:a.aircraftId,entityId:a.entityId,lastVerifiedAt:date,ageDays,reason:a.status==='UNVERIFIED'||!a.reviewed?'Unverified association':ageDays>=90?'90-day review due':ageDays<0?'Future verification date':''};}).filter(a=>a.reason).sort((a,b)=>b.ageDays-a.ageDays);
}
