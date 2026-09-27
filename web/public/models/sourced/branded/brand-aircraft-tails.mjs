/** Add operator-identification paint and unmodified logo textures to sourced fins.
 * Original aircraft meshes are retained; thin surface overlays follow their fins.
 * Generated derivatives retain the source-model GPLv2/GPLv3 notices and editable source.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Matrix4,Cartesian3,Quaternion} from '@cesium/engine';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'public/models/sourced'),out=path.join(source,'branded');
const catalog=JSON.parse(await fs.readFile(path.join(root,'src/lib/sourcedAircraft.json')));
const paints={THY:'c81932',UAL:'2266bd',AAL:'397daf',DAL:'b71b39',BAW:'263f81',DLH:'173c72',AFR:'263d7e',KLM:'23a5d5',QTR:'721e49',UAE:'ca2635',PGT:'e5b620',SWA:'254cc2',JBU:'193979',ETH:'258b50',SAS:'234d9b',RYR:'16457c',EZY:'f16b22',WZZ:'c5197b',SIA:'172f5c',CPA:'126259',ANA:'234d9b',JAL:'c81932',QFA:'cb2033',ACA:'b51c30'};
await fs.mkdir(out,{recursive:true});
const report=[];
function clip(poly,axis,value,above){const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=above?a[axis]>=value:a[axis]<=value,ib=above?b[axis]>=value:b[axis]<=value;if(ia)result.push(a);if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);result.push(a.map((v,k)=>v+(b[k]-v)*t));}}return result;}
function inside(y,z,tri){const [a,b,c]=tri;const cross=(p,q)=>(q[1]-p[1])*(z-p[2])-(q[2]-p[2])*(y-p[1]);const values=[cross(a,b),cross(b,c),cross(c,a)];return values.every(v=>v>=-1e-6)||values.every(v=>v<=1e-6);}
for(const item of catalog){
 const g=JSON.parse(await fs.readFile(path.join(source,`${item.id}-v1.gltf`))),buffers=await Promise.all(g.buffers.map(b=>fs.readFile(path.join(source,b.uri))));
 function accessor(i){const a=g.accessors[i],b=g.bufferViews[a.bufferView],data=buffers[b.buffer],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];if(!n||!size)throw Error('Unsupported accessor');const view=new DataView(data.buffer,data.byteOffset,data.byteLength),offset=(b.byteOffset??0)+(a.byteOffset??0),stride=b.byteStride??size*n;return Array.from({length:a.count},(_,j)=>Array.from({length:n},(_,k)=>{const at=offset+j*stride+k*size;return a.componentType===5126?view.getFloat32(at,true):a.componentType===5125?view.getUint32(at,true):a.componentType===5123?view.getUint16(at,true):view.getUint8(at);}));}
 const triangles=[],all=[];
 function walk(i,parent){const n=g.nodes[i],local=n.matrix?Matrix4.fromArray(n.matrix):Matrix4.fromTranslationQuaternionRotationScale(Cartesian3.fromArray(n.translation??[0,0,0]),Quaternion.unpack(n.rotation??[0,0,0,1]),Cartesian3.fromArray(n.scale??[1,1,1]));const matrix=Matrix4.multiply(parent,local,new Matrix4());
 if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){if(p.mode!==undefined&&p.mode!==4)continue;const points=accessor(p.attributes.POSITION).map(v=>{const pt=Matrix4.multiplyByPoint(matrix,Cartesian3.fromArray(v),new Cartesian3());return [pt.x,pt.y,pt.z];});all.push(...points);const indices=p.indices!==undefined?accessor(p.indices).map(v=>v[0]):points.map((_,i)=>i);for(let k=0;k<indices.length;k+=3)triangles.push(indices.slice(k,k+3).map(i=>points[i]));}
 for(const c of n.children??[])walk(c,matrix);}
 for(const n of g.scenes[g.scene??0].nodes)walk(n,Matrix4.IDENTITY);
 let top=-Infinity,bottom=Infinity;for(const p of all){top=Math.max(top,p[1]);bottom=Math.min(bottom,p[1]);}
 const tips=all.filter(p=>p[1]>top-(top-bottom)*.04),centerX=tips.reduce((s,p)=>s+p[0],0)/tips.length;
 const floor=top-(top-bottom)*.65;
 const fins=[];
 for(const tri of triangles){
  if(tri.some(p=>Math.abs(p[0]-centerX)>Math.max(.7,item.length*.025))||tri.every(p=>p[2]>-item.length*.12))continue;
  const u=tri[1].map((v,k)=>v-tri[0][k]),v=tri[2].map((v,k)=>v-tri[0][k]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);if(!len||Math.abs(n[0])/len<.65)continue;
  let poly=clip(tri,1,floor,true);poly=clip(poly,2,-item.length*.12,false);
  for(let j=1;j<poly.length-1;j++)fins.push([poly[0],poly[j],poly[j+1]]);
 }
 if(!fins.length)throw Error(`No fin surface: ${item.id}`);
 const pts=fins.flat(),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1])),minZ=Math.min(...pts.map(p=>p[2])),maxZ=Math.max(...pts.map(p=>p[2]));
 // Find a large square wholly within the fin silhouette, so no logo floats
 // outside swept edges. Logos are sampled unchanged, with separate UVs per side.
 let placement=null;
 search:for(let size=Math.min(maxY-minY,maxZ-minZ)*.65;size>.12;size*=.9){for(let y=minY+size*.65;y<=maxY-size*.65;y+=(maxY-minY)/16){for(let z=minZ+size*.65;z<=maxZ-size*.65;z+=(maxZ-minZ)/16){if([-.5,0,.5].every(dy=>[-.5,0,.5].every(dz=>fins.some(t=>inside(y+dy*size,z+dz*size,t))))){placement={y,z,size};break search;}}}}
 if(!placement)throw Error(`No logo placement: ${item.id}`);
 const {y,z,size}=placement,paint=[],logo=[];
 for(const tri of fins){const side=tri.reduce((s,p)=>s+p[0],0)/3<centerX?-1:1;
  function emit(target,poly,offset,uv){for(let i=1;i<poly.length-1;i++)for(const p of [poly[0],poly[i],poly[i+1]])target.push({p:[p[0]+side*offset,p[1],p[2]],n:[side,0,0],uv:uv?[(side>0?1:0)-side*((p[2]-(z-size/2))/size),1-(p[1]-(y-size/2))/size]:[0,0]});}
  emit(paint,tri,.012,false);
  let poly=clip(tri,1,y-size/2,true);poly=clip(poly,1,y+size/2,false);poly=clip(poly,2,z-size/2,true);poly=clip(poly,2,z+size/2,false);emit(logo,poly,.028,true);
 }
 if(!logo.some(v=>v.n[0]>0)||!logo.some(v=>v.n[0]<0))throw Error(`Missing logo side: ${item.id}`);
 const chunks=[],views=[],accessors=[];let byteOffset=0;
 function attr(rows,key,dim){const values=rows.flatMap(v=>v[key]),data=Buffer.alloc(values.length*4);values.forEach((v,i)=>data.writeFloatLE(v,i*4));chunks.push(data);const vi=g.bufferViews.length+views.length;views.push({buffer:g.buffers.length,byteOffset,byteLength:data.length,target:34962});byteOffset+=data.length;const ai=g.accessors.length+accessors.length;const a={bufferView:vi,componentType:5126,count:rows.length,type:`VEC${dim}`};if(key==='p'){a.min=Array.from({length:3},(_,i)=>Math.min(...rows.map(v=>v.p[i])));a.max=Array.from({length:3},(_,i)=>Math.max(...rows.map(v=>v.p[i])));}accessors.push(a);return ai;}
 const primitives=[paint,logo].map((rows,i)=>({attributes:{POSITION:attr(rows,'p',3),NORMAL:attr(rows,'n',3),...(i?{TEXCOORD_0:attr(rows,'uv',2)}:{})},material:g.materials.length+i}));
 const name=`${item.id}-tail-v1.bin`;await fs.writeFile(path.join(out,name),Buffer.concat(chunks));
 for(const [operator,color] of Object.entries(paints)){
  const model=structuredClone(g);model.buffers=model.buffers.map(b=>({...b,uri:'../'+b.uri}));model.buffers.push({uri:name,byteLength:byteOffset});model.bufferViews.push(...views);model.accessors.push(...accessors);
  const image=(model.images??=[]).length,texture=(model.textures??=[]).length,sampler=(model.samplers??=[]).length;
  model.images.push({uri:`../../../airlines/${operator}.png`});model.samplers.push({magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071});model.textures.push({source:image,sampler});
  const rgb=[0,2,4].map(i=>parseInt(color.slice(i,i+2),16)/255);
  model.materials.push({name:'Operator tail paint',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:0,roughnessFactor:.65}},{name:'Operator logo identification',doubleSided:true,alphaMode:'BLEND',pbrMetallicRoughness:{baseColorTexture:{index:texture},metallicFactor:0,roughnessFactor:.7},emissiveFactor:[.18,.18,.18],emissiveTexture:{index:texture}});
  const mesh=model.meshes.length,node=model.nodes.length;model.meshes.push({name:'Airline tail surface overlay',primitives});model.nodes.push({name:'AirlineTailBranding',mesh});model.scenes[model.scene??0].nodes.push(node);
  model.extras.skyward.changes+=' Added surface-following operator tail paint and unmodified identification-logo texture. Branding is illustrative, not a registration-specific livery.';model.extras.skyward.operator=operator;
  await fs.writeFile(path.join(out,`${item.id}-${operator}-v1.gltf`),JSON.stringify(model));
 }
 report.push({id:item.id,placement,finTriangles:fins.length,logoTriangles:logo.length/3,operators:Object.keys(paints)});console.log(item.id,placement,'triangles',fins.length,logo.length/3);
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({description:'Surface overlays on original sourced fin geometry. Original PNG logos unchanged. Branding is illustrative.',sourceModelManifest:'../manifest.json',logoManifest:'../../../airlines/sources.json',models:report},null,2));
console.log(`Branded ${report.length} sourced models for ${Object.keys(paints).length} operators.`);

await fs.copyFile(fileURLToPath(import.meta.url),path.join(out,'brand-aircraft-tails.mjs'));
