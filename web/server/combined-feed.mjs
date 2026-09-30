import {AIRPORTS,FeedClient,cameraAreaPath,searchPath} from './feed.mjs';

const distance=(a,b)=>{const r=Math.PI/180,s=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 6880.13*Math.asin(Math.min(1,Math.sqrt(s)));};
const positioned=a=>Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Math.abs(a.lat)<=90&&Math.abs(a.lon)<=180&&Number.isFinite(a.observedAt);
export function mergeFeeds(results,now=Date.now()){
 const rows=new Map(),sources=[];
 for(const {id,data} of results){
  sources.push(id);
  for(const row of data.aircraft){
   if(!/^[a-f0-9]{6}$/i.test(row.hex)||row.observedAt!==null&&(!Number.isFinite(row.observedAt)||row.observedAt>now+5000||row.observedAt<now-300000))continue;
   const a={...row,hex:row.hex.toLowerCase(),positionSource:id},old=rows.get(a.hex);
   if(!old){rows.set(a.hex,a);continue;}
   if(positioned(old)&&!positioned(a))continue;
   if(!positioned(a)&&!positioned(old))continue;
   if(positioned(old)&&a.observedAt<=old.observedAt)continue;
   // Keep a coherent whole fix. Never average coordinates or combine velocity
   // from a different observation. Suspect source changes retain the prior fix.
   if(positioned(old)&&distance(old,a)>5+Math.abs(a.observedAt-old.observedAt)/3600000*1500){rows.set(a.hex,{...old,positionWarning:'Conflicting feed position excluded'});continue;}
   rows.set(a.hex,{...a,registration:a.registration||old.registration,aircraftType:a.aircraftType||old.aircraftType});
  }
 }
 return {source:sources.length>1?'Combined aircraft observations':results[0]?.data.source??'Aircraft observations',fetchedAt:Math.min(...results.map(r=>r.data.fetchedAt)),sourceAt:Math.max(...results.map(r=>r.data.sourceAt)),aircraft:[...rows.values()],sources};
}
export class CombinedFeed {
 constructor(primary,secondary=[]){this.primary=primary;this.providers=[{id:'adsblol',name:'ADSB.lol',url:'https://www.adsb.lol/',license:'ODbL-1.0',client:primary},...secondary];this.health=new Map();}
 get stats(){const stats={started:0,failed:0,cacheHits:0,coalesced:0,suppressed:0,queueExpired:0,totalMs:0,lastSuccessAt:null,lastPositionAt:null};for(const {client} of this.providers){for(const k of ['started','failed','cacheHits','coalesced','suppressed','queueExpired','totalMs'])stats[k]+=client.stats?.[k]??0;for(const k of ['lastSuccessAt','lastPositionAt'])if(client.stats?.[k])stats[k]=Math.max(stats[k]??0,client.stats[k]);}return stats;}
 get pending(){return new Map(this.providers.flatMap(p=>[...(p.client.pending??[])].map(([key,value])=>[p.id+key,value])));}
 get diagnostics(){return this.providers.map(({id,client})=>({id,...client.stats,pending:client.pending.size,cacheEntries:client.cache.size,cooldownUntil:Math.max(0,...client.cooldowns.values())}));}
 get sources(){return this.providers.map(({client,...p})=>({...p,...this.health.get(p.id)}));}
 route(...args){return this.primary.route(...args);}
 area(id){if(!Object.hasOwn(AIRPORTS,id))throw Error('Unknown airport');return this.cameraArea(AIRPORTS[id].lat,AIRPORTS[id].lon,100);}
 async combine(method,args){
  const results=await Promise.allSettled(this.providers.map(async p=>{try{const original=await p.client[method](...args);const data={...original,source:p.name,aircraft:original.aircraft.map(a=>({...a,positionSource:p.id}))};this.health.set(p.id,{available:true,lastSuccessAt:data.fetchedAt});return {id:p.id,data};}catch(e){this.health.set(p.id,{available:false,lastSuccessAt:this.health.get(p.id)?.lastSuccessAt??null,failure:typeof e.status==='number'?`UPSTREAM_${e.status}`:['Provider timestamp is not current','Invalid provider response','Illegal invocation'].includes(e.message)?e.message:e.name||'Error'});throw e;}}));
  const good=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  if(!good.length)throw results.find(r=>r.status==='rejected').reason;
  return {...(this.providers.length===1?good[0].data:mergeFeeds(good)),partial:good.length<this.providers.length,failedSources:results.flatMap((r,i)=>r.status==='rejected'?[this.providers[i].id]:[])};
 }
 cameraArea(lat,lon,radius){cameraAreaPath(lat,lon,radius);return this.combine('cameraArea',[lat,lon,radius]);}
 search(kind,query){searchPath(kind,query);return this.combine('search',[kind,query]);}
 close(){for(const p of this.providers)p.client.close?.();}
}
export function configuredFeed({env=process.env,fetchImpl=fetch}={}){
 const key=env.SKYWARD_FLYITALY_API_KEY?.trim();
 const primary=new FeedClient(fetchImpl);
 if(!key||env.SKYWARD_FLYITALY_ENABLED==='0')return new CombinedFeed(primary);
 if(/[\r\n]/.test(key))throw Error('Invalid supplemental feed key.');
 const client=new FeedClient(async(input,options)=>{
  const path=flyItalyPath(new URL(input).pathname);
  const response=await fetchImpl('https://api.flyitalyadsb.com'+path,{...options,redirect:'manual',headers:{...options.headers,'X-Api-Key':key}});
  if(response.status>=300&&response.status<400)throw Object.assign(new Error('Supplemental feed redirect rejected'),{status:502});
  return response;
 });
 return new CombinedFeed(primary,[{id:'flyitaly',name:'FlyItalyADSB',url:'https://flyitalyadsb.com/',license:'CC BY-SA 4.0; standard API limits',client}]);
}
export function flyItalyPath(path){
 const point=path.match(/^\/v2\/point\/(-?[\d.]+)\/(-?[\d.]+)\/(\d+)$/);
 if(point)return `/v2/lat/${point[1]}/lon/${point[2]}/dist/${Math.ceil(Number(point[3])*1.852)}`;
 if(/^\/v2\/(hex|callsign|reg)\/[A-Z0-9-]+$/i.test(path))return path.replace('/v2/hex/','/v2/icao/');
 throw Error('Unsupported supplemental feed query.');
}
