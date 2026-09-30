import {SITE_ORIGIN} from './site.mjs';
import {sendHttpError} from './error-pages.mjs';
import {createTravelMetrics} from './travel-metrics.mjs';
import {createAurowall} from './aurowall.mjs';
const aurowall=createAurowall();
import {publicPage} from './public-pages.mjs';
import {createOperations,authorizedMetrics,clientAddress} from './operations.mjs';
import {configuredFeed} from './combined-feed.mjs';
import {tripResponse,tripQuery,createTripDiscovery} from './trip-follower.mjs';
import {createLocalWeather} from './local-weather.mjs';
import http from 'node:http';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
const compress = promisify(gzip);
const compressedAssets = new Map();
function acceptsGzip(header='') {
  return header.split(',').some(part=>{const [name,...params]=part.trim().toLowerCase().split(';');return name==='gzip'&&!params.some(p=>/^\s*q\s*=/.test(p)&&Number(p.split('=')[1])===0);});
}
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRPORTS, cameraAreaPath } from './feed.mjs';
import { routePath } from './routes.mjs';
import { airlabsPreview } from './airlabs.mjs';
import {createConfiguredMembership} from './membership-config.mjs';
import {createAirportWeather} from './airport-weather.mjs';
import {simulatorPage} from './simulator.mjs';
const feed = configuredFeed();
const membership=await createConfiguredMembership({observations:()=>{const rows=new Map();for(const p of feed.providers)for(const item of p.client.cache.values())for(const a of item.value?.aircraft??[]){if((a.observedAt??0)>(rows.get(a.hex)?.observedAt??0))rows.set(a.hex,a);}return [...rows.values()];}});

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../dist');
const gameRoot = resolve(here, '../../dist/web');
const tripDiscovery=createTripDiscovery(feed);
const airportWeather=createAirportWeather();
const localWeather=createLocalWeather();
const rates = new Map();
const operations=createOperations(),travelMetrics=createTravelMetrics();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
function json(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
export const server = http.createServer(async (req, res) => {
  operations.observe(res);
  if(process.env.SKYWARD_ACCESS_LOG==='1'){const start=Date.now();res.once('finish',()=>console.log(`${req.method} ${(req.url?.startsWith('/share/')||req.url?.startsWith('/api/watch-room/'))?'/private-link/[redacted]':req.url?.split('?')[0]} ${res.statusCode} ${Date.now()-start}ms`));}
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try {
    const memberUrl = new URL(req.url, 'http://localhost');
    if(await travelMetrics.handle(req,res,memberUrl)) return;
    if(await membership.handle(req,res,memberUrl)) return;
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/metrics') {
      if(!authorizedMetrics(req.headers.authorization,process.env.SKYWARD_METRICS_TOKEN))return json(res,401,{error:'Unauthorized'});
      return json(res,200,{server:operations.snapshot(),feeds:feed.diagnostics});
    }
    const published=publicPage(url,{SKYWARD_PUBLIC_ORIGIN:SITE_ORIGIN,...process.env});
    if(published){if(published.location){res.writeHead(published.status,{Location:published.location,'Cache-Control':'no-store'});return res.end();}res.writeHead(published.status,{'Content-Type':published.type,'Cache-Control':published.status===200?'public, max-age=300':'no-store'});return res.end(req.method==='HEAD'?undefined:published.body);}
    if (url.pathname === '/healthz' || url.pathname === '/readyz') {
      try { await stat(resolve(webRoot, 'index.html')); return json(res, 200, { status: 'ok', service: 'skyward', upstream: 'not checked' }); }
      catch { return json(res, 503, { status: 'unavailable', error: 'Build assets missing' }); }
    }
    if (url.pathname.startsWith('/api/')) {
      const ip = clientAddress(req,process.env.SKYWARD_TRUST_LOOPBACK_PROXY==='1');
      const rate = rates.get(ip) ?? { start: Date.now(), count: 0 };
      if (Date.now() - rate.start > 60000) { rate.start = Date.now(); rate.count = 0; }
      rate.count++; rates.set(ip, rate);
      if (rate.count > 60) { res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rate.start + 60000 - Date.now()) / 1000)))); return json(res, 429, { error: 'Please wait a moment before refreshing.' }); }
      if (rates.size > 500) rates.delete(rates.keys().next().value);
      try {
        if(url.pathname==='/api/trips'){try{return json(res,200,url.searchParams.get('sample')==='1'?await tripResponse(url.searchParams):tripDiscovery(tripQuery(url.searchParams)));}catch(e){return json(res,e.status||503,{error:e.status?e.message:'Trip lookup unavailable.'});}}
        if(url.pathname==='/api/weather-overview')return json(res,200,await localWeather.overview());
        if(url.pathname==='/api/aurowall'){try{return json(res,200,await aurowall());}catch{return json(res,503,{error:'Music library is temporarily unavailable. Please retry.'});}}
        if(url.pathname==='/api/local-weather'){const coords=['lat','lon'].map(k=>{const v=url.searchParams.get(k);return v!==null&&v.trim()!==''?Number(v):NaN;});try{return json(res,200,await localWeather(...coords));}catch(e){return json(res,e.status||503,{error:e.status?e.message:'Weather unavailable.'});}}
        if(url.pathname==='/api/airport-weather'){try{return json(res,200,await airportWeather(url.searchParams.get('airport')));}catch(e){return json(res,e.status||503,{error:e.status?e.message:'Weather observations are unavailable. Try again later.'});}}
        if (url.pathname === '/api/flight-details') return json(res, 200, airlabsPreview(process.env.SKYWARD_AIRLABS_MODE));
        if(url.pathname==='/api/feed-sources')return json(res,200,{sources:feed.sources});
        if (url.pathname === '/api/status') {const {totalMs,...stats}=feed.stats;return json(res,200,{...stats,sources:feed.sources,pending:feed.pending.size,meanProviderMs:stats.started?Math.round(totalMs/stats.started):0});}
        if (url.pathname === '/api/area') {
          const values=['lat','lon','radius'].map(key=>{const raw=url.searchParams.get(key);return raw!==null&&raw.trim()!==''?Number(raw):NaN;});
          try{cameraAreaPath(...values);}catch(e){return json(res,400,{error:e.message});}
          return json(res,200,await feed.cameraArea(...values));
        }
        if (url.pathname === '/api/aircraft') {
          const airport = url.searchParams.get('airport');
          if (!Object.hasOwn(AIRPORTS, airport)) return json(res, 400, { error: 'Choose an airport from the directory.' });
          return json(res, 200, await feed.area(airport));
        }
        if (url.pathname === '/api/route') {
          const callsign = url.searchParams.get('callsign');
          const lat = url.searchParams.get('lat')?.trim() ? Number(url.searchParams.get('lat')) : NaN;
          const lon = url.searchParams.get('lon')?.trim() ? Number(url.searchParams.get('lon')) : NaN;
          try { routePath(callsign, lat, lon); } catch (e) { return json(res, 400, { error: e.message }); }
          return json(res, 200, await feed.route(callsign, lat, lon));
        }
        if (url.pathname === '/api/search') {
          const kind = url.searchParams.get('kind'); const q = url.searchParams.get('q');
          if (!['callsign', 'registration', 'hex'].includes(kind)) return json(res, 400, { error: 'Unknown search type.' });
          try { const { searchPath } = await import('./feed.mjs'); searchPath(kind, q); } catch (e) { return json(res, 400, { error: e.message }); }
          return json(res, 200, await feed.search(kind, q));
        }
        return json(res, 404, { error: 'Endpoint not found' });
      } catch (error) { if(error.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));return json(res, 503, { error: error.retryAfter?'Flight feed temporarily rate limited. Retrying automatically.':'Live feed unavailable. Last observations are retained with their original timestamps.', ...(error.retryAfter?{retryAfter:error.retryAfter}:{}) }); }
    }
    if (['/watch','/watch/','/watch/index.html','/index.html'].includes(url.pathname)) { res.writeHead(302, { Location: '/' + url.search, 'Cache-Control':'no-store' }); return res.end(); }
    if (url.pathname === '/airport-simulation') { res.writeHead(302, { Location: '/airport-simulation/' + url.search, 'Cache-Control':'no-store' }); return res.end(); }
    if(url.pathname==='/flight-simulator'){res.writeHead(302,{Location:'/flight-simulator/','Cache-Control':'no-store'});return res.end();}
    const isAccount=url.pathname==='/account/';
    if(isAccount)res.setHeader('X-Robots-Tag','noindex, nofollow');
    const isFlight=url.pathname==='/flight-simulator/';
    if(isFlight){const access=await membership.simulatorAccess(req);if(!access.allowed){res.writeHead(access.status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'});return res.end(simulatorPage(access).replaceAll('Airport simulator','Flight simulator').replaceAll('airport simulator','flight simulator'));}}
    const isWatch = url.pathname.startsWith('/watch/');
    const isGame = url.pathname.startsWith('/airport-simulation/');
    if(!isAccount&&!isFlight&&!isWatch&&!isGame&&!['/','/offline-worker.js'].includes(url.pathname))return sendHttpError(req,res,404,'File not found');
    if(isGame) {
      const access=await membership.simulatorAccess(req);
      const document=['/airport-simulation/','/airport-simulation/index.html'].includes(url.pathname);
      if(!access.allowed||document&&url.searchParams.get('embed')!=='1') {
        if(!document&&!access.allowed)return json(res,access.status,{error:'An active Premium subscription is required to load simulator assets.'});
        const page=Buffer.from(simulatorPage(access));
        res.writeHead(access.status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Length':page.length});
        return res.end(req.method==='HEAD'?undefined:page);
      }
    }
    const root = isGame ? gameRoot : webRoot;
    const path = decodeURIComponent(isFlight||isAccount?'':isWatch ? url.pathname.slice('/watch/'.length) : isGame ? url.pathname.slice('/airport-simulation/'.length) : url.pathname.slice(1));
    let file = resolve(root, path || 'index.html');
    if (file !== root && !file.startsWith(root + sep)) return sendHttpError(req,res,403,'Forbidden');
    try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); } catch(error) { if(['ENOENT','ENOTDIR'].includes(error.code))return sendHttpError(req,res,404,'File not found');throw error; }
    let data;try{data=await readFile(file);}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return sendHttpError(req,res,404,'File not found');throw error;}
    if (/\.(js|css|json|geojson|svg|html|gltf)$/.test(file)) {
      res.setHeader('Vary','Accept-Encoding');
      if(data.length>=1024 && acceptsGzip(req.headers['accept-encoding'])) {
        const info=await stat(file),key=`${file}:${info.mtimeMs}:${info.size}`;
        let packed=compressedAssets.get(key);
        if(!packed){packed=compress(data);compressedAssets.set(key,packed);if(compressedAssets.size>16)compressedAssets.delete(compressedAssets.keys().next().value);}
        try {data=await packed;} catch(error){compressedAssets.delete(key);throw error;}
        res.setHeader('Content-Encoding','gzip');
      }
    }
    res.setHeader('Content-Length',data.length);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': isGame ? 'private, no-store' : extname(file) === '.html' ? 'no-store' : /[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]+\.(js|css)$/.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { sendHttpError(req,res,500,'Unable to serve this request.'); }
});
let premiumTimer;
server.on('listening',()=>{if(membership.premiumTick)premiumTimer=setInterval(()=>{void membership.premiumTick().catch(()=>console.error('Background account check failed.'));},60000).unref();});
server.on('close',()=>{clearInterval(premiumTimer);feed.close();});
server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Let Node bind dual-stack localhost by default; explicit HOST remains supported.
  server.listen({port:Number(process.env.PORT ?? 8000), ...(process.env.HOST ? {host:process.env.HOST} : {}), ipv6Only:false}, () => console.log(`Skyward: http://localhost:${server.address().port}/ · airport simulation: /airport-simulation/`));
  const stop = () => { server.close(() => { void Promise.resolve(membership.close()).then(() => process.exit(0), () => process.exit(1)); }); setTimeout(() => process.exit(1), 10000).unref(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}

