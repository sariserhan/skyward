/** Import the pinned, GPLv2 aircraft collection and its editable source files.
 * No paid service, account, or new package. Cesium's installed converter upgrades
 * legacy glTF. Geometry, materials and textures remain the source authors' work.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import parseGlb from '../node_modules/@cesium/engine/Source/Scene/GltfPipeline/parseGlb.js';
import updateVersion from '../node_modules/@cesium/engine/Source/Scene/GltfPipeline/updateVersion.js';
import {Matrix4,Cartesian3,Quaternion} from '@cesium/engine';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const commit='dd53267690c6a4ecbb290a3acf0284333a5d68a9';
const repo='https://github.com/Flightradar24/fr24-3d-models';
const raw=`https://raw.githubusercontent.com/Flightradar24/fr24-3d-models/${commit}/`;
const out=path.join(root,'public/models/sourced');
const definitions=[
 ['beluga','Airbus A300-600ST Beluga',['A3ST']],['ask21','Schleicher ASK 21',['AS21']],['bae146','BAe 146',[]],
 ['a318','Airbus A318',['A318']],['a319','Airbus A319',['A319']],['a320','Airbus A320',['A320']],['a321','Airbus A321',['A321']],
 ['a332','Airbus A330-200',['A332']],['a333','Airbus A330-300',['A333']],['a343','Airbus A340-300',['A343']],['a346','Airbus A340-600',['A346']],['a359','Airbus A350-900',['A359'],'a350'],['a380','Airbus A380',['A388']],
 ['b736','Boeing 737-600',['B736']],['b737','Boeing 737-700',['B737']],['b738','Boeing 737-800',['B738']],['b739','Boeing 737-900',['B739']],['b744','Boeing 747-400',['B744']],['b748','Boeing 747-8',['B748']],
 ['b752','Boeing 757-200',['B752']],['b753','Boeing 757-300',['B753']],['b762','Boeing 767-200',['B762']],['b763','Boeing 767-300',['B763']],['b764','Boeing 767-400',['B764']],['b772','Boeing 777-200',['B772']],['b773','Boeing 777-300',['B773']],['b788','Boeing 787-8',['B788']],['b789','Boeing 787-9',['B789']],
 ['crj700','Bombardier CRJ700',['CRJ7']],['crj900','Bombardier CRJ900',['CRJ9']],['cs100','Airbus A220-100 / CSeries CS100',['BCS1']],['cs300','Airbus A220-300 / CSeries CS300',['BCS3']],['e170','Embraer E170',['E170']],['e190','Embraer E190',['E190']],['q400','De Havilland Dash 8 Q400',['DH8D']],['citation','Cessna Citation II',['C550']],['pa28','Piper PA-28',['PA28']],['atr42','ATR 42',['AT43','AT45','AT46']],
];
await fs.mkdir(out,{recursive:true});
const tree=await (await fetch(`https://api.github.com/repos/Flightradar24/fr24-3d-models/git/trees/${commit}?recursive=1`)).json();
if(!Array.isArray(tree.tree)||tree.truncated)throw Error('Incomplete source listing');
const files=[];
async function download(remote,local){
 const target=path.join(out,local);let data;
 try{data=await fs.readFile(target);}catch{
  const response=await fetch(raw+remote,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`${response.status}: ${remote}`);data=Buffer.from(await response.arrayBuffer());await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);
 }
 const expected=tree.tree.find(x=>x.path===remote);
 if(!expected||data.length!==expected.size)throw Error(`Source size mismatch: ${remote}`);
 const sha=createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');if(sha!==expected.sha)throw Error(`Source git hash mismatch: ${remote}`);
 files.push({path:local,sourceUrl:raw+remote,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});return data;
}
await download('LICENSE','LICENSE.txt');await download('README.md','UPSTREAM-CREDITS.md');
const models=[];
for(const [id,label,types,sourceDir] of definitions){
 const data=await download(`models/${id}.glb`,`original/${id}.glb`);
 const sources=tree.tree.filter(x=>x.type==='blob'&&x.path.startsWith(`source/${sourceDir??id}/`)&&!x.path.endsWith('.DS_Store'));
 if(!sources.some(x=>x.path.endsWith('.blend')))throw Error(`Editable source missing for ${id}`);
 await Promise.all(sources.map(x=>download(x.path,x.path)));
 const g=parseGlb(new Uint8Array(data));updateVersion(g);
 // Legacy conversion leaves a placeholder URI beside embedded image data.
 // glTF 2 images must have one source; otherwise Cesium caches unrelated
 // textures under the same data:, URL and applies the wrong aircraft paint.
 for(const image of g.images??[])if(image.bufferView!==undefined)delete image.uri;
 const min=new Cartesian3(Infinity,Infinity,Infinity),max=new Cartesian3(-Infinity,-Infinity,-Infinity),vertices=[];
 function walk(index,parent){
  const n=g.nodes[index],local=n.matrix?Matrix4.fromArray(n.matrix):Matrix4.fromTranslationQuaternionRotationScale(Cartesian3.fromArray(n.translation??[0,0,0]),Quaternion.unpack(n.rotation??[0,0,0,1]),Cartesian3.fromArray(n.scale??[1,1,1]));
  const matrix=Matrix4.multiply(parent,local,new Matrix4());
  if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){
   const a=g.accessors[p.attributes.POSITION],bv=g.bufferViews[a.bufferView],buffer=g.buffers[bv.buffer].extras._pipeline.source;
   if(a.componentType!==5126||a.type!=='VEC3')throw Error(`Unexpected position format: ${id}`);
   const view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength),offset=(bv.byteOffset??0)+(a.byteOffset??0),stride=bv.byteStride??12;
   for(let i=0;i<a.count;i++){const at=offset+i*stride;const pt=Matrix4.multiplyByPoint(matrix,new Cartesian3(view.getFloat32(at,true),view.getFloat32(at+4,true),view.getFloat32(at+8,true)),new Cartesian3());Cartesian3.minimumByComponent(min,pt,min);Cartesian3.maximumByComponent(max,pt,max);vertices.push(pt);}
  }
  for(const child of n.children??[])walk(child,matrix);
 }
 const scene=g.scenes[g.scene??0];for(const n of scene.nodes)walk(n,Matrix4.IDENTITY);
 const center=Cartesian3.multiplyByScalar(Cartesian3.add(min,max,new Cartesian3()),.5,new Cartesian3());
 // The upper fin locates the tail. Normalize this source axis to -Z, leaving
 // the nose at +Z, Y up. Only rigid transforms: do not stretch the model.
 const top=vertices.filter(p=>p.y>max.y-(max.y-min.y)*.035);
 const tail=top.reduce((p,v)=>Cartesian3.add(p,v,p),new Cartesian3());Cartesian3.divideByScalar(tail,top.length,tail);
 const dx=tail.x-center.x,dz=tail.z-center.z;
 const angle=Math.abs(dx)>Math.abs(dz)?(dx>0?Math.PI/2:-Math.PI/2):(dz>0?Math.PI:0);
 const c=Math.cos(angle),s=Math.sin(angle);
 const matrix=[c,0,-s,0,0,1,0,0,s,0,c,0,-c*center.x-s*center.z,0,s*center.x-c*center.z,1];
 const node=g.nodes.length;g.nodes.push({name:'SkywardCoordinateAlignment',matrix,children:scene.nodes});scene.nodes=[node];
 const length=Math.abs(dx)>Math.abs(dz)?max.x-min.x:max.z-min.z;
 if(length<4||length>90)throw Error(`Unexpected aircraft dimensions: ${id} ${length}`);
 for(let i=0;i<g.buffers.length;i++){const buf=g.buffers[i],name=`${id}-v1-${i}.bin`;await fs.writeFile(path.join(out,name),buf.extras._pipeline.source);buf.uri=name;buf.byteLength=buf.extras._pipeline.source.byteLength;}
 g.asset.copyright=[g.asset.copyright,'FlightGear model authors / Flightradar24 contributors; GPLv2. See UPSTREAM-CREDITS.md and LICENSE.txt.'].filter(Boolean).join(' ');
 g.extras={...g.extras,skyward:{source:repo,commit,changes:'Converted legacy glTF to glTF 2.0 with Cesium; rigid axis alignment and horizontal centering only. Original geometry, materials and paint retained.',license:'GPL-2.0',sourceFiles:sources.map(x=>x.path)}};
 const clean=JSON.stringify(g,(k,v)=>k==='_pipeline'?undefined:v);
 await fs.writeFile(path.join(out,`${id}-v1.gltf`),clean);
 models.push({id,label,types,uri:`models/sourced/${id}-v1.gltf`,length:Number(length.toFixed(2)),rotation:angle,license:'GPL-2.0',sourceUrl:`${repo}/blob/${commit}/models/${id}.glb`,editableSources:sources.map(x=>`models/sourced/${x.path}`)});
 console.log(`Imported ${id}: ${length.toFixed(1)}m, ${vertices.length} vertices, ${sources.length} source files`);
}
// Preserve independently sourced models when refreshing the original catalog.
const prior=JSON.parse(await fs.readFile(path.join(out,'manifest.json')).catch(()=>'{"models":[],"files":[]}'));
const ownIds=new Set(models.map(m=>m.id));
models.push(...prior.models.filter(m=>!ownIds.has(m.id)));
const ownPaths=new Set(files.map(f=>f.path));
files.push(...prior.files.filter(f=>!ownPaths.has(f.path))); 
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({repository:repo,commit,retrievedAt:new Date().toISOString(),license:'GPL-2.0',models,files},null,2)+'\n');
await fs.writeFile(path.join(root,'src/lib/sourcedAircraft.json'),JSON.stringify(models.map(({id,label,types,uri,length,variantVerified,fidelityNote,sourceRepository})=>({id,label,types,uri,length,...(sourceRepository?{sourceRepository}:{}),...(variantVerified===undefined?{}:{variantVerified,fidelityNote})})),null,2)+'\n');
console.log(`Imported ${models.length} aircraft with corresponding editable source files and pinned provenance.`);
