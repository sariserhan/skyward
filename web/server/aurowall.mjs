import {AwsClient} from 'aws4fetch';
const credit={name:'Aurowall',url:'https://aurowall.com'};
const xmlValue=(xml,tag)=>xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
export function audioTrack(key,base,prefix=''){
 if(/(?:^|\/)(?:prayer|quran)(?:\/|\.|$)/i.test(key))return null;
 if(!key.startsWith(prefix)||!key.match(/\.(mp3|m4a|ogg|wav|aac|flac)$/i)||key.split('/').some(p=>p==='.'||p==='..'||!p)||key.length>1000)return null;
 const parts=key.split('/'),folder=parts.length>1?parts[parts.length-2]:'Audio';
 const stem=parts.at(-1).replace(/\.[^.]+$/,'');const title=(stem===folder?stem:parts.length>1?`${folder} · ${stem}`:stem).replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
 return {id:key,title,url:base+'/'+parts.map(encodeURIComponent).join('/')};
}
export function createAurowall({env=process.env,fetcher=fetch,now=Date.now}={}){
 let cache=null,expires=0,pending=null,retryAt=0;
 const base=(()=>{try{const u=new URL(env.R2_PUBLIC_URL);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u.href.replace(/\/$/,''):null;}catch{return null;}})();
 const configured=base&&/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID??'')&&env.R2_ACCESS_KEY_ID&&env.R2_SECRET_ACCESS_KEY&&env.R2_BUCKET;
 const client=configured?new AwsClient({accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto',retries:0}):null;
 return async()=>{
  if(!configured)return {available:false,tracks:[],credit};
  if(cache&&now()<expires)return cache;
  if(now()<retryAt){if(cache)return {...cache,stale:true};throw Error('Audio library temporarily unavailable');}
  if(pending)return pending;
  pending=(async()=>{
   const tracks=[];let token;
   for(let page=0;page<5;page++){
    const url=new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeURIComponent(env.R2_BUCKET)}`);
    url.searchParams.set('list-type','2');url.searchParams.set('max-keys','1000');url.searchParams.set('encoding-type','url');if(env.AUROWALL_AUDIO_PREFIX)url.searchParams.set('prefix',env.AUROWALL_AUDIO_PREFIX);if(token)url.searchParams.set('continuation-token',token);
    const request=await client.sign(url,{signal:AbortSignal.timeout(12000)});const response=await fetcher(request);
    if(!response.ok)throw Error('Audio library temporarily unavailable');
    const xml=await response.text();if(xml.length>2000000)throw Error('Audio catalog is too large');
    for(const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){const encoded=xmlValue(m[1],'Key');if(!encoded)continue;const track=audioTrack(decodeURIComponent(encoded),base,env.AUROWALL_AUDIO_PREFIX??'');if(track)tracks.push(track);}
    token=xmlValue(xml,'NextContinuationToken');if(!token)break;
   }
   cache={available:true,tracks:tracks.sort((a,b)=>a.title.localeCompare(b.title)),credit,truncated:!!token};expires=now()+3600000;return cache;
  })().catch(()=>{retryAt=now()+60000;if(cache)return {...cache,stale:true};throw Error('Audio library temporarily unavailable');}).finally(()=>{pending=null;});
  return pending;
 };
}
