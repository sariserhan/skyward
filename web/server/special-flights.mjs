import source from '../data/airframe-catalog.json' with {type:'json'};
import routes from '../data/special-aircraft-routes.json' with {type:'json'};
import {publishedCatalog,identityAt} from '../src/lib/airframeCatalog.ts';
import {eligibleLiveCandidates,liveCollections} from '../src/lib/liveCollections.ts';
const catalog=publishedCatalog(source);
export const SPECIAL_INTERVAL=60000;
/** Global request coalescing in the existing coordinator; no per-viewer fleet sweep or position storage. */
export function createSpecialFlights(feed,{now=Date.now,c=catalog,paths=routes}={}){
 let snapshot=null,pending=null,next=0;
 const current=()=>({...snapshot,rows:(snapshot?.rows??[]).filter(r=>now()-r.aircraft.observedAt<=120000&&r.aircraft.observedAt<=now()+30000),nextCheckAt:next});
 async function refresh(){
  const candidates=eligibleLiveCandidates(c,now()),registrations=candidates.map(a=>identityAt(a,'registrations',new Date(now()).toISOString().slice(0,10)).value);
  next=now()+SPECIAL_INTERVAL;
  const observations=[];let completed=0,failed=0;
  for(let i=0;i<registrations.length;i+=150){
   try{const result=await feed.registrations(registrations.slice(i,i+150));observations.push(...result.aircraft);completed+=Math.min(150,registrations.length-i);}
   catch{failed++;}
  }
  const rows=liveCollections(c,observations,now()).flatMap(({aircraft,relationship})=>{
   const a=candidates.find(a=>a.registrations.some(r=>r.value===aircraft.registration));
   const choices=paths.filter(p=>p.aircraftId===a?.id);
   // Prefer the sponsored team/brand over an additional airline association.
   const path=choices.find(p=>c.entities.find(e=>e.id===p.entityId)?.entityType==='SPORTS_TEAM')??choices[0];
   return path?[{...path,relationship,aircraft}]:[];
  });
  snapshot={state:failed?(completed?'partial':'unavailable'):'ready',checkedAt:now(),checkedAircraft:completed,totalAircraft:registrations.length,rows};
  return current();
 }
 return async()=>{
  if(pending)return pending;
  if(snapshot&&now()<next)return current();
  pending=refresh().finally(()=>{pending=null;});return pending;
 };
}
