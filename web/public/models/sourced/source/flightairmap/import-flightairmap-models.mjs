/** Import pinned, per-model GPLv2/GPLv3 aircraft and its editable source files.
 * No paid service, account, or new package. Cesium's installed converter upgrades
 * legacy glTF. Geometry, materials and textures remain the source authors' work.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import parseGlb from '../node_modules/@cesium/engine/Source/Scene/GltfPipeline/parseGlb.js';
import updateVersion from '../node_modules/@cesium/engine/Source/Scene/GltfPipeline/updateVersion.js';
import {Matrix4,Matrix3,Cartesian3,Quaternion} from '@cesium/engine';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const commit='0906d9ba1bdd906ce45807e45ed706c09912db19';
const repo='https://github.com/Ysurac/FlightAirMap-3dmodels';
const raw=`https://raw.githubusercontent.com/Ysurac/FlightAirMap-3dmodels/${commit}/`;
const out=path.join(root,'public/models/sourced');
const definitions=[
 ['b407','Bell 407',['B407'],'b407','B407'],
 ['c421','Cessna 421 Golden Eagle',['C421'],'c421','C421'],
 ['atr72','ATR 72-500',['AT75'],'atr72','AT75','GPL-3.0'],
 ['c182','Cessna 182 Skylane',['C182'],'c182','C182'],
 ['c208','Cessna 208 Caravan',['C208'],'c208','C208'],
 ['crj2','Bombardier CRJ200',['CRJ2'],'crj2','CRJ2'],
 ['dhc4','De Havilland DHC-4 Caribou',['DHC4'],'dhc4','DHC4'],
 ['dr40','Robin DR400',['DR40'],'dr40','DR40'],
 ['e145','Embraer ERJ 145',['E145'],'e145','E145'],
 ['e175','Embraer E175',['E75L'],'e190','E75L'],
 ['ec35','Eurocopter EC135',['EC35'],'ec35','EC35'],
 ['gazl','Aérospatiale Gazelle',['GAZL'],'gazl','GAZL'],
 ['md11','McDonnell Douglas MD-11',['MD11'],'md11','MD11'],
 ['p40','Curtiss P-40 Warhawk',['P40'],'p40','P40'],
 ['pa18','Piper PA-18 Super Cub',['PA18'],'pa18','PA18'],
 ['pa22','Piper PA-22 Tri-Pacer',['PA22'],'pa22','PA22'],
 ['pa32','Piper PA-32 Cherokee Six',['PA32'],'pa32','PA32'],
 ['pc12','Pilatus PC-12',['PC12'],'pc12','PC12'],
 ['pc21','Pilatus PC-21',['PC21'],'pc21','PC21','GPL-3.0'],
 ['sr22','Cirrus SR22',['SR22'],'sr22','SR22'],
 ['t134','Tupolev Tu-134',['T134'],'t134','T134'],
 ['b703','Boeing 707',['B703'],'b707','707','GPL-3.0'],
];
await fs.mkdir(out,{recursive:true});
const tree=await (await fetch(`https://api.github.com/repos/Ysurac/FlightAirMap-3dmodels/git/trees/${commit}?recursive=1`)).json();
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
await download('README.md','source/flightairmap/README.md');
// The converted model folders omit licenses; retain their pinned FlightGear originals.
for(const [dir,repository,revision,readme] of [
 ['b407','bell407','934e469483db7b1bc5eb1339070003a1b0ffd429','README.md'],
 ['c421','Cessna-421-Golden-Eagle','7ed263927c6536e34910c48defdea6e7026e0452','README.txt'],
])for(const name of ['COPYING',readme]){
 const sourceUrl=`https://raw.githubusercontent.com/FGMEMBERS/${repository}/${revision}/${name}`;
 const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Missing upstream license/credits: ${sourceUrl}`);
 const data=Buffer.from(await response.arrayBuffer()),local=`source/flightairmap/${dir}/upstream-${name}`;
 if(name==='COPYING'&&!data.toString().includes('GNU GENERAL PUBLIC LICENSE'))throw Error('Unexpected model license');
 await fs.mkdir(path.dirname(path.join(out,local)),{recursive:true});await fs.writeFile(path.join(out,local),data);
 files.push({path:local,sourceUrl,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
}

const models=[];
for(const [id,label,types,sourceDir,code,license='GPL-2.0'] of definitions){
 const data=await download(`${sourceDir}/glTF2/${code}.glb`,`source/flightairmap/${sourceDir}/${code}.glb`);
 const sources=tree.tree.filter(x=>x.type==='blob'&&x.path.startsWith(`${sourceDir}/`)&&!x.path.includes('/output/')&&!x.path.includes('/glTF2/')&&!x.path.endsWith('.DS_Store')&&!x.path.endsWith('.dae')&&!x.path.endsWith('.gltf'));
 if(!sources.some(x=>x.path.endsWith('.blend')))throw Error(`Editable source missing for ${id}`);
 await Promise.all(sources.map(x=>download(x.path,`source/flightairmap/${x.path}`)));
 const g=parseGlb(new Uint8Array(data));updateVersion(g);
 // Legacy conversion leaves a placeholder URI beside embedded image data.
 // glTF 2 images must have one source; otherwise Cesium caches unrelated
 // textures under the same data:, URL and applies the wrong aircraft paint.
 for(const image of g.images??[])if(image.bufferView!==undefined)delete image.uri;
 const min=new Cartesian3(Infinity,Infinity,Infinity),max=new Cartesian3(-Infinity,-Infinity,-Infinity),vertices=[],transforms=[];
 function walk(index,parent){
  const n=g.nodes[index],local=n.matrix?Matrix4.fromArray(n.matrix):Matrix4.fromTranslationQuaternionRotationScale(Cartesian3.fromArray(n.translation??[0,0,0]),Quaternion.unpack(n.rotation??[0,0,0,1]),Cartesian3.fromArray(n.scale??[1,1,1]));
  const matrix=Matrix4.multiply(parent,local,new Matrix4());transforms.push({index,matrix});
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
 // Bake rigid source-node transforms into vertices. Cesium computes model
 // bounds from only two transformed AABB corners, which fails for rotations.
 // Baking keeps every authored point in the same place and yields valid bounds.
 const baked=new Map(),alignment=Matrix4.fromArray(matrix);
 for(const entry of transforms){
  const n=g.nodes[entry.index],world=Matrix4.multiply(alignment,entry.matrix,new Matrix4());
  const normalMatrix=Matrix3.inverseTranspose(Matrix4.getMatrix3(world,new Matrix3()),new Matrix3());
  if(n.mesh!==undefined)for(const primitive of g.meshes[n.mesh].primitives){
   for(const [semantic,ai] of Object.entries(primitive.attributes)){
    if(!['POSITION','NORMAL','TANGENT'].includes(semantic))continue;
    const signature=JSON.stringify([...Matrix4.toArray(world),semantic]);
    if(baked.has(ai)){if(baked.get(ai)!==signature)throw Error(`Instanced accessor needs duplication: ${id}`);continue;}baked.set(ai,signature);
    const a=g.accessors[ai],bv=g.bufferViews[a.bufferView],buffer=g.buffers[bv.buffer].extras._pipeline.source;
    if(a.componentType!==5126)throw Error(`Unsupported transform accessor ${id}`);
    const view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength),offset=(bv.byteOffset??0)+(a.byteOffset??0),stride=bv.byteStride??(a.type==='VEC4'?16:12),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<a.count;i++){
     const at=offset+i*stride,v=new Cartesian3(view.getFloat32(at,true),view.getFloat32(at+4,true),view.getFloat32(at+8,true));
     const result=semantic==='POSITION'?Matrix4.multiplyByPoint(world,v,new Cartesian3()):Matrix3.multiplyByVector(normalMatrix,v,new Cartesian3());
     if(semantic!=='POSITION'&&Cartesian3.magnitude(result)>0)Cartesian3.normalize(result,result);
     for(const [k,value] of [result.x,result.y,result.z].entries()){view.setFloat32(at+k*4,value,true);const rounded=view.getFloat32(at+k*4,true);lo[k]=Math.min(lo[k],rounded);hi[k]=Math.max(hi[k],rounded);}
    }
    if(semantic==='POSITION'){a.min=lo;a.max=hi;}else{delete a.min;delete a.max;}
   }
  }
  delete n.matrix;delete n.translation;delete n.rotation;delete n.scale;
 }
 g.nodes[node].matrix=Matrix4.toArray(Matrix4.IDENTITY);
 const length=Math.abs(dx)>Math.abs(dz)?max.x-min.x:max.z-min.z;
 if(length<4||length>90)throw Error(`Unexpected aircraft dimensions: ${id} ${length}`);
 for(let i=0;i<g.buffers.length;i++){const buf=g.buffers[i],name=`${id}-v1-${i}.bin`;await fs.writeFile(path.join(out,name),buf.extras._pipeline.source);buf.uri=name;buf.byteLength=buf.extras._pipeline.source.byteLength;}
 g.asset.copyright=[g.asset.copyright,`FlightGear model authors / FlightAirMap contributors; ${license}. See source/flightairmap/${sourceDir}/ for license and editable sources.`].filter(Boolean).join(' ');
 g.extras={...g.extras,skyward:{source:repo,commit,changes:'Converted legacy glTF to glTF 2.0 with Cesium; rigid axis alignment, horizontal centering, and source transforms baked into positions/normals for correct Cesium bounds. Original shape, materials and paint retained.',license,sourceFiles:sources.map(x=>`source/flightairmap/${x.path}`)}};
 const clean=JSON.stringify(g,(k,v)=>k==='_pipeline'?undefined:v);
 await fs.writeFile(path.join(out,`${id}-v1.gltf`),clean);
 models.push({id,label,types,uri:`models/sourced/${id}-v1.gltf`,length:Number(length.toFixed(2)),rotation:angle,license,sourceUrl:`${repo}/blob/${commit}/${sourceDir}/glTF2/${code}.glb`,editableSources:sources.map(x=>`models/sourced/source/flightairmap/${x.path}`),sourceRepository:repo});
 console.log(`Imported ${id}: ${length.toFixed(1)}m, ${vertices.length} vertices, ${sources.length} source files`);
}
const prior=JSON.parse(await fs.readFile(path.join(out,'manifest.json')));
const ownIds=new Set(models.map(m=>m.id));
prior.models=[...prior.models.filter(m=>!ownIds.has(m.id)),...models];
prior.files=[...prior.files.filter(f=>!f.path?.startsWith('source/flightairmap/')),...files];
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(prior,null,2)+'\n');
const catPath=path.join(root,'src/lib/sourcedAircraft.json'),cat=JSON.parse(await fs.readFile(catPath));
await fs.writeFile(catPath,JSON.stringify([...cat.filter(m=>!ownIds.has(m.id)),...models.map(({id,label,types,uri,length,sourceRepository})=>({id,label,types,uri,length,sourceRepository}))],null,2)+'\n');
await fs.copyFile(fileURLToPath(import.meta.url),path.join(out,'source/flightairmap/import-flightairmap-models.mjs'));
console.log(`Imported ${models.length} additional authored models.`);
