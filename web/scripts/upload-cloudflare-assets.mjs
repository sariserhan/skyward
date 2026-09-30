// Explicit upload only. A normal build or dry-run never writes to Cloudflare.
import {readFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),manifest=JSON.parse(await readFile(resolve(root,'.cloudflare/release.json'))),upload=process.argv.includes('--upload');
const bucket=process.env.SKYWARD_R2_BUCKET||'skyward-assets';if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))throw Error('Invalid bucket name');
if(!upload){console.log(`Dry run: ${manifest.files.length} objects to ${bucket}/releases/${manifest.release}/. Use --upload only after reviewing R2 usage and release retention.`);process.exit(0);}
if(process.env.SKYWARD_R2_UPLOAD_APPROVED!=='1')throw Error('Set SKYWARD_R2_UPLOAD_APPROVED=1 after verifying retained + incoming R2 storage remains below 8 GiB.');
const mime={'.gltf':'model/gltf+json','.glb':'model/gltf-binary','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.pck':'application/octet-stream'};
for(const f of manifest.files){const result=spawnSync(resolve(root,'node_modules/.bin/wrangler'),['r2','object','put',`${bucket}/releases/${manifest.release}/${f.key}`,'--file',resolve(root,f.file),'--content-type',mime[extname(f.key)]||'application/octet-stream','--remote'],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log(`Uploaded immutable release ${manifest.release}. Set SKYWARD_ASSET_RELEASE only after verifying objects. No old release was deleted.`);
