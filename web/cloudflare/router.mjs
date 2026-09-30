import {publicPage} from '../server/public-pages.mjs';
import {errorPage} from '../server/error-pages.mjs';
import {simulatorPage} from '../server/simulator.mjs';
const coordinator=env=>env.COORDINATOR.get(env.COORDINATOR.idFromName('skyward-primary-v1'));
const error=status=>{const page=errorPage(status);return new Response(page.body,{status,headers:{'Content-Type':page.type,'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});};
async function r2Asset(request,env,key,privateAsset=false){
 if(!env.SKYWARD_ASSET_RELEASE||!/^[a-zA-Z0-9._-]{1,80}$/.test(env.SKYWARD_ASSET_RELEASE))return error(503);
 if(!['GET','HEAD'].includes(request.method))return error(405);
 let decoded;try{decoded=decodeURIComponent(key);}catch{return error(400);}
 if(decoded.split('/').some(p=>!p||p==='.'||p==='..')||/[\\\x00]/.test(decoded))return error(400);
 const cachedUrl=new URL(request.url);cachedUrl.searchParams.set('__release',env.SKYWARD_ASSET_RELEASE);const cacheKey=new Request(cachedUrl,{method:'GET'}),cache=globalThis.caches?.default;
 if(!privateAsset&&!request.headers.has('range')){const hit=await cache?.match(cacheKey);if(hit)return request.method==='HEAD'?new Response(null,hit):hit;}
 const full=`releases/${env.SKYWARD_ASSET_RELEASE}/${decoded}`,obj=request.method==='HEAD'?await env.MEDIA.head(full):await env.MEDIA.get(full,{range:request.headers});if(!obj)return error(404);
 const headers=new Headers();obj.writeHttpMetadata(headers);headers.set('ETag',obj.httpEtag);if(request.headers.get('if-none-match')===obj.httpEtag)return new Response(null,{status:304,headers});headers.set('Accept-Ranges','bytes');headers.set('Cache-Control',privateAsset?'private, no-store':'public, max-age=3600');headers.set('X-Content-Type-Options','nosniff');
 let status=200;if(obj.range){status=206;headers.set('Content-Range',`bytes ${obj.range.offset}-${obj.range.offset+obj.range.length-1}/${obj.size}`);headers.set('Content-Length',String(obj.range.length));}else headers.set('Content-Length',String(obj.size));
 const response=new Response(request.method==='HEAD'?null:obj.body,{status,headers});if(!privateAsset&&status===200&&request.method==='GET')await cache?.put(cacheKey,response.clone());return response;
}
export async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(url.hostname==='www.skyvvard.com')return Response.redirect('https://skyvvard.com'+path+url.search,308);
 if(path.startsWith('/internal/'))return error(404);
 if(path==='/healthz'||path==='/readyz')return Response.json({service:'skyward',status:'ok',accountsConfigured:!!(env.BETTER_AUTH_SECRET&&env.RESEND_API_KEY),assetsConfigured:!!env.SKYWARD_ASSET_RELEASE},{headers:{'Cache-Control':'no-store'}});
 if(path.startsWith('/api/')||path.startsWith('/share/')||path.startsWith('/travelers')){
  if(request.body){const reader=request.body.getReader(),chunks=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();return Response.json({error:'Request too large'},{status:413});}chunks.push(part.value);}const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}request=new Request(request,{body});}
  return coordinator(env).fetch(request);
 }
 if(path.startsWith('/watch/models/'))return r2Asset(request,env,'watch/models/'+path.slice('/watch/models/'.length));
 if(['/watch','/watch/','/watch/index.html','/index.html'].includes(path))return Response.redirect(url.origin+'/'+url.search,308);
 if(['/airport-simulation','/flight-simulator'].includes(path))return Response.redirect(url.origin+path+'/'+url.search,308);
 const page=publicPage(url,env);if(page){if(page.location)return new Response(null,{status:page.status,headers:{Location:page.location}});return new Response(request.method==='HEAD'?null:page.body,{status:page.status,headers:{'Content-Type':page.type,'Cache-Control':page.status===200?'public, max-age=300':'no-store'}});}
 const game=path.startsWith('/airport-simulation/'),flight=path==='/flight-simulator/',account=path==='/account/';
 if(game||flight){const access=await (await coordinator(env).fetch(new Request(new URL('/internal/access',url),{headers:request.headers}))).json();if(!access.allowed||game&&path==='/airport-simulation/'&&url.searchParams.get('embed')!=='1')return new Response(request.method==='HEAD'?null:simulatorPage(access),{status:access.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});if(game)return r2Asset(request,env,'airport-simulation/'+(path.slice('/airport-simulation/'.length)||'index.html'),true);}
 if(path==='/'||account||flight){const response=await env.ASSETS.fetch(new Request(new URL('/watch/index.html',url),{method:request.method}));const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');if(account||flight)headers.set('X-Robots-Tag','noindex, nofollow');return new Response(response.body,{status:response.status,headers});}
 if(path.startsWith('/watch/')||path==='/offline-worker.js'){const response=await env.ASSETS.fetch(request);return response.status===404?error(404):response;}
 return error(404);
}
export default {async fetch(request,env){try{const response=await handle(request,env),headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('X-Frame-Options','SAMEORIGIN');if(new URL(request.url).hostname!=='skyvvard.com')headers.set('X-Robots-Tag','noindex, nofollow');return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});}catch{return error(503);}},async scheduled(_event,env,ctx){ctx.waitUntil(coordinator(env).fetch(new Request('https://skyvvard.com/internal/cleanup',{method:'POST'})));}};
