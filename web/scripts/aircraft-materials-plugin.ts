import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import type {Plugin} from 'vite';
import {refineAircraftMaterials} from '../src/lib/aircraftMaterials.ts';
/** Refine served/build copies; source assets and license notices stay intact. */
export function aircraftMaterialsPlugin():Plugin{
 let root='',out='',building=false;const cache=new Map<string,{mtime:number;body:string}>();
 return {name:'skyward-aircraft-materials',configResolved(c){building=c.command==='build';root=resolve(c.publicDir,'models');out=resolve(c.root,c.build.outDir,'models');},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
  const pathname=new URL(req.url??'/', 'http://local').pathname.replace(/^\/watch/,'');
  if(!pathname.startsWith('/models/')||!pathname.endsWith('.gltf')||!['GET','HEAD'].includes(req.method??''))return next();
  try{const file=resolve(root,decodeURIComponent(pathname.slice(8)));if(!file.startsWith(root+sep))return next();
   const info=await stat(file);let item=cache.get(file);if(!item||item.mtime!==info.mtimeMs){const model=JSON.parse(await readFile(file,'utf8'));refineAircraftMaterials(model);item={mtime:info.mtimeMs,body:JSON.stringify(model)};cache.set(file,item);if(cache.size>64)cache.delete(cache.keys().next().value!);}
   res.setHeader('Content-Type','model/gltf+json');res.setHeader('Cache-Control','no-cache');res.end(req.method==='HEAD'?undefined:item.body);
  }catch{next();}
 });},async closeBundle(){
  async function visit(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(entry.name.endsWith('.gltf')){const model=JSON.parse(await readFile(file,'utf8'));if(refineAircraftMaterials(model))await writeFile(file,JSON.stringify(model));}}}
  if(building)await visit(out);
 }};
}
