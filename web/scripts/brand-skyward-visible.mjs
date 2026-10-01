// Preserve existing aircraft rigs; add separate orbit tail and surface-following title decals.
import fs from 'node:fs';
import {Matrix4,Cartesian3,Quaternion} from '@cesium/engine';
const root=new URL('../public/models/sourced/branded/',import.meta.url);
for(const [id,L,D] of [['a320',38,4],['b738',40,3.8],['b789',63,5.8]]){
 const g=JSON.parse(fs.readFileSync(new URL(`${id}-SKYWARD-v1.gltf`,root))),buffers=g.buffers.map(b=>fs.readFileSync(new URL(b.uri.split('?')[0],root)));
 function accessor(i){const a=g.accessors[i],b=g.bufferViews[a.bufferView],data=buffers[b.buffer],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];if(!n||!size)throw Error('Unsupported accessor');const view=new DataView(data.buffer,data.byteOffset,data.byteLength),offset=(b.byteOffset??0)+(a.byteOffset??0),stride=b.byteStride??size*n;return Array.from({length:a.count},(_,j)=>Array.from({length:n},(_,k)=>{const at=offset+j*stride+k*size;return a.componentType===5126?view.getFloat32(at,true):a.componentType===5125?view.getUint32(at,true):a.componentType===5123?view.getUint16(at,true):view.getUint8(at);}));}
 const triangles=[],all=[];
 function walk(i,parent){const n=g.nodes[i],local=n.matrix?Matrix4.fromArray(n.matrix):Matrix4.fromTranslationQuaternionRotationScale(Cartesian3.fromArray(n.translation??[0,0,0]),Quaternion.unpack(n.rotation??[0,0,0,1]),Cartesian3.fromArray(n.scale??[1,1,1]));const matrix=Matrix4.multiply(parent,local,new Matrix4());
 if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){if(p.mode!==undefined&&p.mode!==4)continue;const points=accessor(p.attributes.POSITION).map(v=>{const pt=Matrix4.multiplyByPoint(matrix,Cartesian3.fromArray(v),new Cartesian3());return [pt.x,pt.y,pt.z];});all.push(...points);const indices=p.indices!==undefined?accessor(p.indices).map(v=>v[0]):points.map((_,i)=>i);for(let k=0;k<indices.length;k+=3)triangles.push(indices.slice(k,k+3).map(i=>points[i]));}
 for(const c of n.children??[])walk(c,matrix);}
 for(const n of g.scenes[g.scene??0].nodes)if(g.nodes[n].name!=='AirlineTailBranding')walk(n,Matrix4.IDENTITY);


 const center={a320:2.3,b738:-.1,b789:1.3}[id],width=D*2.2,height=width/4,z=L*.17,y=center+.02*D;
 const clip=(poly,axis,value,above)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=above?a[axis]>=value:a[axis]<=value,ib=above?b[axis]>=value:b[axis]<=value;if(ia)out.push(a);if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;};
 const rows=[];
 for(const tri of triangles){
  const side=tri.reduce((n,p)=>n+p[0],0)>0?1:-1;
  if(tri.some(p=>Math.abs(p[0])<D*.25||Math.abs(p[0])>D*.6))continue;
  const a=Cartesian3.subtract(Cartesian3.fromArray(tri[1]),Cartesian3.fromArray(tri[0]),new Cartesian3()),b=Cartesian3.subtract(Cartesian3.fromArray(tri[2]),Cartesian3.fromArray(tri[0]),new Cartesian3()),n=Cartesian3.cross(a,b,new Cartesian3());
  if(Math.abs(n.x)<Cartesian3.magnitude(n)*.5)continue;
  let poly=clip(tri,1,y-height/2,true);poly=clip(poly,1,y+height/2,false);poly=clip(poly,2,z-width/2,true);poly=clip(poly,2,z+width/2,false);
  for(let i=1;i<poly.length-1;i++)for(const p of [poly[0],poly[i],poly[i+1]])rows.push({p:[p[0]+side*.035,p[1],p[2]],n:[side,0,0],uv:[side>0?1-(p[2]-z+width/2)/width:(p[2]-z+width/2)/width,1-(p[1]-y+height/2)/height]});
 }
 if(!rows.some(r=>r.n[0]>0)||!rows.some(r=>r.n[0]<0))throw Error('Missing fuselage side '+id);
 for(const image of g.images??[])if(image.uri?.includes('/airlines/'))image.uri='../../../airlines/SKYWARD-tail-v2.png';
 const texture=g.textures.length;g.images.push({uri:'../../../airlines/SKYWARD-body-v3.png'});g.textures.push({source:g.images.length-1,sampler:g.textures.at(-1).sampler});
 const material=g.materials.length;g.materials.push({name:'skyVVard fuselage title',doubleSided:true,alphaMode:'MASK',alphaCutoff:.1,pbrMetallicRoughness:{baseColorTexture:{index:texture},metallicFactor:0,roughnessFactor:.65},emissiveFactor:[.25,.25,.25],emissiveTexture:{index:texture}});
 const chunks=[],attrs={};let offset=0;
 for(const [key,field,dim] of [['POSITION','p',3],['NORMAL','n',3],['TEXCOORD_0','uv',2]]){const values=rows.flatMap(r=>r[field]),data=Buffer.alloc(values.length*4);values.forEach((v,i)=>data.writeFloatLE(v,i*4));chunks.push(data);g.bufferViews.push({buffer:g.buffers.length,byteOffset:offset,byteLength:data.length,target:34962});offset+=data.length;attrs[key]=g.accessors.length;g.accessors.push({bufferView:g.bufferViews.length-1,componentType:5126,count:rows.length,type:'VEC'+dim,...(key==='POSITION'?{min:[0,1,2].map(i=>Math.min(...rows.map(r=>r.p[i]))),max:[0,1,2].map(i=>Math.max(...rows.map(r=>r.p[i])))}:{})});}
 const file=id+'-SKYWARD-body-v2.bin';fs.writeFileSync(new URL(file,root),Buffer.concat(chunks));g.buffers.push({uri:file,byteLength:offset});g.meshes.push({name:'skyVVard fuselage title',primitives:[{attributes:attrs,material}]});g.nodes.push({name:'SkyWardFuselageBranding',mesh:g.meshes.length-1});g.scenes[g.scene??0].nodes.push(g.nodes.length-1);

 // Expand the orbit mark over the upper fin, clipping it to real tail surfaces.
 const tail=g.meshes.find(m=>m.name==='Airline tail surface overlay'),logo=tail.primitives[1];
 const old=accessor(logo.attributes.POSITION),minY=Math.min(...old.map(p=>p[1])),maxY=Math.max(...old.map(p=>p[1])),minZ=Math.min(...old.map(p=>p[2])),maxZ=Math.max(...old.map(p=>p[2]));
 const size=Math.max(maxY-minY,maxZ-minZ)*1.65,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2,paint=accessor(tail.primitives[0].attributes.POSITION),marks=[];
 for(let i=0;i<paint.length;i+=3){const tri=paint.slice(i,i+3),side=tri.reduce((n,p)=>n+p[0],0)>0?1:-1;let poly=clip(tri,1,cy-size/2,true);poly=clip(poly,1,cy+size/2,false);poly=clip(poly,2,cz-size/2,true);poly=clip(poly,2,cz+size/2,false);for(let j=1;j<poly.length-1;j++)for(const p of [poly[0],poly[j],poly[j+1]])marks.push({p:[p[0]+side*.025,p[1],p[2]],n:[side,0,0],uv:[side>0?1-(p[2]-cz+size/2)/size:(p[2]-cz+size/2)/size,1-(p[1]-cy+size/2)/size]});}
 const tailChunks=[],tailAttrs={};let tailOffset=0;
 for(const [key,field,dim] of [['POSITION','p',3],['NORMAL','n',3],['TEXCOORD_0','uv',2]]){const values=marks.flatMap(r=>r[field]),data=Buffer.alloc(values.length*4);values.forEach((v,i)=>data.writeFloatLE(v,i*4));tailChunks.push(data);g.bufferViews.push({buffer:g.buffers.length,byteOffset:tailOffset,byteLength:data.length,target:34962});tailOffset+=data.length;tailAttrs[key]=g.accessors.length;g.accessors.push({bufferView:g.bufferViews.length-1,componentType:5126,count:marks.length,type:'VEC'+dim,...(key==='POSITION'?{min:[0,1,2].map(i=>Math.min(...marks.map(r=>r.p[i]))),max:[0,1,2].map(i=>Math.max(...marks.map(r=>r.p[i])))}:{})});}
 const tailFile=id+'-SKYWARD-tail-v2.bin';fs.writeFileSync(new URL(tailFile,root),Buffer.concat(tailChunks));g.buffers.push({uri:tailFile,byteLength:tailOffset});logo.attributes=tailAttrs;g.materials[logo.material].emissiveFactor=[.6,.6,.6];
 fs.writeFileSync(new URL(id+'-SKYWARD-v2.gltf',root),JSON.stringify(g));console.log(id,rows.length/3,'fuselage decal triangles');
}
