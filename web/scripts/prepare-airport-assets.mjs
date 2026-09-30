/** Prepare a checksummed static upload manifest; never deploys or needs credentials. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import catalog from '../data/airport-catalog.json' with {type:'json'};
const files=[],runways=[],ground=[];
const elevations=JSON.parse(await readFile(new URL('../data/airport-elevations.json',import.meta.url)));
for(const id of Object.keys(catalog).sort()){
 const key=`data/airports/${id}.json`,data=await readFile(new URL(`../public/${key}`,import.meta.url));
 if(data.length>8*1024*1024)throw new Error(`${id} exceeds airport asset size budget`);
 const airport=JSON.parse(data);for(const r of airport.runways??[]){if([...r.a,...r.b,r.width].every(Number.isFinite)&&r.width>0&&(r.a[0]!==r.b[0]||r.a[1]!==r.b[1]))runways.push([id,...r.a,...r.b,r.width,Number.isFinite(elevations[id])?elevations[id]*.3048:null]);}
 const lon=airport.lon??catalog[id].lon,lat=airport.lat??catalog[id].lat;
 const points=[[lon,lat],...(airport.runways??[]).flatMap(r=>[r.a,r.b]),...(airport.surfaces??[]).flatMap(s=>s.points??[]),...(airport.paths??[]).flatMap(p=>p.points??[]),...(airport.gates??[]).map(g=>g.position)].filter(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite));
 const dx=points.map(p=>((p[0]-lon+540)%360)-180),ys=points.map(p=>p[1]);
 // Include every mapped surface, gate and service road, with an airport shoulder.
 const padY=150/111320,padX=padY/Math.max(.01,Math.cos(lat*Math.PI/180));
 ground.push([id,lon,lat,Math.min(...dx)-padX,Math.min(...ys)-padY,Math.max(...dx)+padX,Math.max(...ys)+padY,Number.isFinite(elevations[id])?elevations[id]*.3048:null]);
 files.push({key,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const totalBytes=files.reduce((n,f)=>n+f.bytes,0);
if(totalBytes>250*1024*1024)throw new Error('Airport assets exceed 250 MB project budget');
await writeFile(new URL('../public/data/airport-assets.json',import.meta.url),JSON.stringify({schemaVersion:1,contentType:'application/json',cacheControl:'public, max-age=300',totalBytes,files}));
console.log(`Prepared ${files.length} airport assets: ${(totalBytes/1024/1024).toFixed(2)} MB; no upload performed`);

await writeFile(new URL('../data/runway-terrain.json',import.meta.url),JSON.stringify(runways));

await writeFile(new URL('../data/airport-terrain.json',import.meta.url),JSON.stringify(ground));
