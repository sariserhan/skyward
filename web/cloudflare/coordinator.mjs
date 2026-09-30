import {createTravelMetrics} from '../server/travel-metrics.mjs';
import {workerFetch} from './fetch.mjs';
import {DurableObject} from 'cloudflare:workers';
import {configuredFeed} from '../server/combined-feed.mjs';
import {AIRPORTS,cameraAreaPath,searchPath} from '../server/feed.mjs';
import {routePath} from '../server/routes.mjs';
import {createLocalWeather} from '../server/local-weather.mjs';
import {createAirportWeather} from '../server/airport-weather.mjs';
import {createAurowall} from '../server/aurowall.mjs';
import {createTripDiscovery,tripQuery,tripResponse} from '../server/trip-follower.mjs';
import {airlabsPreview} from '../server/airlabs.mjs';
import {createAccountMembership} from '../server/account-membership.mjs';
import {createD1Auth} from './auth.mjs';
import {d1Pool} from './d1-pool.mjs';
import {nodeHandler} from './node-handler.mjs';
const valid=fn=>{try{return fn();}catch(e){throw Object.assign(e,{status:400});}};
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export class SkywardCoordinator extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.tail=Promise.resolve();this.rates=new Map();this.metrics=createTravelMetrics({env});
  this.feed=configuredFeed({env,fetchImpl:workerFetch});this.weather=createLocalWeather({fetchImpl:workerFetch});this.airportWeather=createAirportWeather({fetchImpl:workerFetch});this.music=createAurowall({env});this.trips=createTripDiscovery(this.feed);
  this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS daily_budget(day TEXT PRIMARY KEY,requests INTEGER NOT NULL)');
  if(env.BETTER_AUTH_SECRET&&env.RESEND_API_KEY){
   this.auth=createD1Auth(env,{waitUntil:p=>ctx.waitUntil(p)});const {pool,transaction}=d1Pool(env.DB);
   this.membership=createAccountMembership({env,pool,fetchImpl:workerFetch,auth:this.auth,origin:env.SKYWARD_PUBLIC_ORIGIN,transact:transaction,throttleRequest:async()=>{},observations:()=>{const rows=new Map();for(const p of this.feed.providers)for(const item of p.client.cache.values())for(const a of item.value?.aircraft??[])if((a.observedAt??0)>(rows.get(a.hex)?.observedAt??0))rows.set(a.hex,a);return [...rows.values()];}});
  }
 }
 fetch(request){const run=this.tail.then(()=>this.route(request));this.tail=run.catch(()=>{});return run;}
 async route(request){
  const url=new URL(request.url),path=url.pathname;
  try{
   const day=new Date().toISOString().slice(0,10),count=this.ctx.storage.sql.exec('INSERT INTO daily_budget VALUES(?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1 RETURNING requests',day).one().requests;
   if(count>Number(this.env.SKYWARD_DYNAMIC_DAILY_LIMIT||50000))return json({error:'Daily service capacity reached. Please try again tomorrow.'},503);
   if(path==='/internal/cleanup'){
    if(request.method!=='POST')return json({error:'Method not allowed'},405);
    await this.env.DB.batch([this.env.DB.prepare('DELETE FROM user WHERE id IN (SELECT id FROM user WHERE emailVerified=0 AND createdAt < ? LIMIT 100)').bind(new Date(Date.now()-7*86400000).toISOString()),this.env.DB.prepare('DELETE FROM session WHERE id IN (SELECT id FROM session WHERE expiresAt < ? LIMIT 200)').bind(new Date().toISOString()),this.env.DB.prepare('DELETE FROM verification WHERE id IN (SELECT id FROM verification WHERE expiresAt < ? LIMIT 200)').bind(new Date().toISOString()),this.env.DB.prepare('DELETE FROM rateLimit WHERE key IN (SELECT key FROM rateLimit WHERE lastRequest < ? LIMIT 500)').bind(Date.now()-86400000)]);
    this.ctx.storage.sql.exec('DELETE FROM daily_budget WHERE day < ?',day);return json({ok:true});
   }
   if(path==='/internal/access'){const response=await nodeHandler(request,async(req,res)=>{const access=await this.membership?.simulatorAccess(req)??{allowed:false,status:401};res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(access));return true;});return response;}
   const ip=request.headers.get('cf-connecting-ip')||'local',now=Date.now(),old=this.rates.get(ip),rate=old&&now-old.at<60000?old:{at:now,count:0};rate.count++;this.rates.set(ip,rate);if(this.rates.size>1000)this.rates.delete(this.rates.keys().next().value);if(rate.count>120)return json({error:'Please wait before refreshing.'},429);
   if(path==='/api/travel-metrics')return nodeHandler(request,(req,res,u)=>this.metrics.handle(req,res,u));
   if(path.startsWith('/api/auth/'))return this.auth?this.auth.handler(request):json({error:'Account email is not configured yet.'},503);
   if(this.membership){const r=await nodeHandler(request,(req,res,u)=>this.membership.handle(req,res,u));if(r){if(r.status>=500)this.metrics.record('server_request_error');return r;}}
   if(path==='/api/account')return json({enabled:false,authProvider:'better-auth',mode:'test',user:null,billingReady:false,liveDetailsReady:false});
   if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
   if(path==='/api/area'){const values=['lat','lon','radius'].map(k=>url.searchParams.has(k)&&url.searchParams.get(k).trim()?Number(url.searchParams.get(k)):NaN);valid(()=>cameraAreaPath(...values));return json(await this.feed.cameraArea(...values));}
   if(path==='/api/aircraft'){const id=url.searchParams.get('airport');if(!Object.hasOwn(AIRPORTS,id))return json({error:'Choose an airport'},400);return json(await this.feed.area(id));}
   if(path==='/api/route'){const args=[url.searchParams.get('callsign'),Number(url.searchParams.get('lat')),Number(url.searchParams.get('lon'))];valid(()=>routePath(...args));return json(await this.feed.route(...args));}
   if(path==='/api/search'){const args=[url.searchParams.get('kind'),url.searchParams.get('q')];valid(()=>searchPath(...args));return json(await this.feed.search(...args));}
   if(path==='/api/status'){const {totalMs,...stats}=this.feed.stats;return json({...stats,sources:this.feed.sources,pending:this.feed.pending.size,meanProviderMs:stats.started?Math.round(totalMs/stats.started):0});}
   if(path==='/api/feed-sources')return json({sources:this.feed.sources});
   if(path==='/api/flight-details')return json(airlabsPreview(this.env.SKYWARD_AIRLABS_MODE));
   if(path==='/api/weather-overview')return json(await this.weather.overview());
   if(path==='/api/local-weather')return json(await this.weather(...['lat','lon'].map(k=>url.searchParams.has(k)?Number(url.searchParams.get(k)):NaN)));
   if(path==='/api/airport-weather')return json(await this.airportWeather(url.searchParams.get('airport')));
   if(path==='/api/aurowall')return json(await this.music());
   if(path==='/api/trips')return json(url.searchParams.get('sample')==='1'?await tripResponse(url.searchParams):this.trips(tripQuery(url.searchParams)));
   return json({error:'Endpoint not found'},404);
  }catch(e){if(!e.status||e.status>=500)this.metrics.record('server_request_error');return json({error:e.status?e.message:'This service is temporarily unavailable. Please retry.',...(Number.isFinite(e.retryAfter)?{retryAfter:e.retryAfter}:{})},e.status||503);}
 }
}
