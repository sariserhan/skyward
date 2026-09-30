/** Prepare a checksummed static upload manifest; never deploys or needs credentials. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import catalog from '../data/airport-catalog.json' with {type:'json'};
const files=[];
for(const id of Object.keys(catalog).sort()){
 const key=`data/airports/${id}.json`,data=await readFile(new URL(`../public/${key}`,import.meta.url));
 if(data.length>8*1024*1024)throw new Error(`${id} exceeds airport asset size budget`);
 files.push({key,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const totalBytes=files.reduce((n,f)=>n+f.bytes,0);
if(totalBytes>250*1024*1024)throw new Error('Airport assets exceed 250 MB project budget');
await writeFile(new URL('../public/data/airport-assets.json',import.meta.url),JSON.stringify({schemaVersion:1,contentType:'application/json',cacheControl:'public, max-age=300',totalBytes,files}));
console.log(`Prepared ${files.length} airport assets: ${(totalBytes/1024/1024).toFixed(2)} MB; no upload performed`);
