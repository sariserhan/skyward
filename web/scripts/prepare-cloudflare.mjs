import {airframePage,airframeDocument,airframePaths} from '../server/airframe-pages.mjs';
import {publicPage} from '../server/public-pages.mjs';
import {observatoryDocument} from '../server/observatory-document.mjs';
import catalog from '../data/airport-catalog.json' with {type:'json'};
import {readdir,readFile,writeFile,mkdir,rm,cp,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist'),out=resolve(root,'.cloudflare'),assets=resolve(out,'assets');
await rm(assets,{recursive:true,force:true});await mkdir(resolve(assets,'watch'),{recursive:true});
await writeFile(resolve(assets,'_headers'),'/watch/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/watch/models/*\n  Cache-Control: public, max-age=3600\n/watch/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/offline-worker.js\n  Cache-Control: no-cache\n');
const media=[];let staticCount=0;
async function walk(dir,prefix){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name),key=prefix+entry.name;if(entry.isDirectory())await walk(path,key+'/');else{const info=await stat(path);if(key.startsWith('airport-simulation/')){media.push({key,file:relative(root,path),bytes:info.size,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}else{if(info.size>25*1024*1024)throw Error(`Asset exceeds static hosting limit: ${key}`);await mkdir(resolve(assets,key,'..'),{recursive:true});await cp(path,resolve(assets,key));staticCount++;}}}}
await walk(dist,'watch/');await cp(resolve(dist,'offline-worker.js'),resolve(assets,'offline-worker.js'));
try{await stat(resolve(root,'../dist/web/index.html'));await walk(resolve(root,'../dist/web'),'airport-simulation/');}catch(e){if(e.code!=='ENOENT')throw e;console.log('Airport game export is absent; export Godot before enabling that simulator in production.');}
// Airport entry pages are generated once per build and served by Static Assets, not Workers.
const shell=await readFile(resolve(dist,'index.html'),'utf8');
for(const id of Object.keys(catalog)){const path=`/airports/${id}/`,page=publicPage(new URL(path,'https://skyvvard.com'),{SKYWARD_PUBLIC_ORIGIN:'https://skyvvard.com'});await mkdir(resolve(assets,'airports',id),{recursive:true});await writeFile(resolve(assets,'airports',id,'index.html'),observatoryDocument(page,shell));staticCount++;}
for(const path of airframePaths()){const page=airframePage(path);if(page.redirect)continue;await mkdir(resolve(assets,'.'+path),{recursive:true});await writeFile(resolve(assets,'.'+path,'index.html'),airframeDocument(page,shell));staticCount++;}
if(staticCount>19000)throw Error('Static asset count exceeds the conservative free-plan budget');
const bytes=media.reduce((n,m)=>n+m.bytes,0);if(bytes>4*1024**3)throw Error('A release must stay below 4 GiB (two retained releases within 8 GiB).');
const release=createHash('sha256').update(JSON.stringify(media.map(({key,sha256})=>({key,sha256})))).digest('hex').slice(0,16);
await writeFile(resolve(out,'release.json'),JSON.stringify({release,staticCount,bytes,files:media},null,2));console.log(`Prepared ${staticCount} static assets; ${media.length} R2 objects (${(bytes/1024**2).toFixed(1)} MiB). Release: ${release}. Nothing uploaded.`);
