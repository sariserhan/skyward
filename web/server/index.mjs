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
import { FeedClient, AIRPORTS, cameraAreaPath } from './feed.mjs';
import { routePath } from './routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../dist');
const gameRoot = resolve(here, '../../dist/web');
const feed = new FeedClient();
const rates = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
function json(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
export const server = http.createServer(async (req, res) => {
  if(process.env.SKYWARD_ACCESS_LOG==='1'){const start=Date.now();res.once('finish',()=>console.log(`${req.method} ${req.url?.split('?')[0]} ${res.statusCode} ${Date.now()-start}ms`));}
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try {
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      try { await stat(resolve(webRoot, 'index.html')); return json(res, 200, { status: 'ok', service: 'skyward', upstream: 'not checked' }); }
      catch { return json(res, 503, { status: 'unavailable', error: 'Build assets missing' }); }
    }
    if (url.pathname.startsWith('/api/')) {
      const ip = req.socket.remoteAddress;
      const rate = rates.get(ip) ?? { start: Date.now(), count: 0 };
      if (Date.now() - rate.start > 60000) { rate.start = Date.now(); rate.count = 0; }
      rate.count++; rates.set(ip, rate);
      if (rate.count > 60) { res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rate.start + 60000 - Date.now()) / 1000)))); return json(res, 429, { error: 'Please wait a moment before refreshing.' }); }
      if (rates.size > 500) rates.delete(rates.keys().next().value);
      try {
        if (url.pathname === '/api/status') {const {totalMs,...stats}=feed.stats;return json(res,200,{...stats,pending:feed.pending.size,meanProviderMs:stats.started?Math.round(totalMs/stats.started):0});}
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
      } catch { return json(res, 503, { error: 'Live feed unavailable. Last observations are retained with their original timestamps.' }); }
    }
    if (['/watch','/watch/','/watch/index.html','/index.html'].includes(url.pathname)) { res.writeHead(302, { Location: '/' + url.search, 'Cache-Control':'no-store' }); return res.end(); }
    if (url.pathname === '/airport-simulation') { res.writeHead(302, { Location: '/airport-simulation/' + url.search, 'Cache-Control':'no-store' }); return res.end(); }
    const isWatch = url.pathname.startsWith('/watch/');
    const isGame = url.pathname.startsWith('/airport-simulation/');
    if(!isWatch&&!isGame&&!['/','/offline-worker.js'].includes(url.pathname))return json(res,404,{error:'File not found'});
    const root = isGame ? gameRoot : webRoot;
    const path = decodeURIComponent(isWatch ? url.pathname.slice('/watch/'.length) : isGame ? url.pathname.slice('/airport-simulation/'.length) : url.pathname.slice(1));
    let file = resolve(root, path || 'index.html');
    if (file !== root && !file.startsWith(root + sep)) return json(res, 403, { error: 'Forbidden' });
    try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); } catch { return json(res, 404, { error: 'File not found' }); }
    let data = await readFile(file);
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
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': extname(file) === '.html' ? 'no-store' : /[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]+\.(js|css)$/.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { json(res, 500, { error: 'Unable to serve this request.' }); }
});
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(Number(process.env.PORT ?? 8000), process.env.HOST ?? '0.0.0.0', () => console.log(`Skyward: http://localhost:${process.env.PORT ?? 8000}/ · airport simulation: /airport-simulation/`));
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}

