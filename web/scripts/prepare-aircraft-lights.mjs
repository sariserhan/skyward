/** Approximate light anchors measured from the authored mesh, without modifying it. */
import fs from 'node:fs/promises';
import {Matrix4,Cartesian3,Quaternion} from '@cesium/engine';
const root=new URL('../',import.meta.url),catalog=JSON.parse(await fs.readFile(new URL('src/lib/sourcedAircraft.json',root)));
const profiles=(await fs.readdir(new URL('public/models/fleet/',root))).filter(n=>n.endsWith('-neutral-v4.gltf'));
const models=[...catalog.map(m=>({id:m.id,uri:m.uri})),...profiles.map(n=>({id:'fallback:'+n.replace('-neutral-v4.gltf',''),uri:'models/fleet/'+n}))],result={},gears={};
for(const {id,uri} of models){
 const file=new URL('public/'+uri,root),g=JSON.parse(await fs.readFile(file)),buffers=await Promise.all(g.buffers.map(b=>fs.readFile(new URL(b.uri,file)))),points=[];
 function walk(i,parent){const n=g.nodes[i],local=n.matrix?Matrix4.fromArray(n.matrix):Matrix4.fromTranslationQuaternionRotationScale(Cartesian3.fromArray(n.translation??[0,0,0]),Quaternion.unpack(n.rotation??[0,0,0,1]),Cartesian3.fromArray(n.scale??[1,1,1])),world=Matrix4.multiply(parent,local,new Matrix4());
  if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){const a=g.accessors[p.attributes.POSITION],bv=g.bufferViews[a.bufferView],buf=buffers[bv.buffer],offset=(bv.byteOffset??0)+(a.byteOffset??0),stride=bv.byteStride??12;for(let k=0;k<a.count;k++){const at=offset+k*stride,v=Matrix4.multiplyByPoint(world,new Cartesian3(buf.readFloatLE(at),buf.readFloatLE(at+4),buf.readFloatLE(at+8)),new Cartesian3());points.push([v.x,v.y,v.z]);}}
  for(const c of n.children??[])walk(c,world);
 }
 for(const n of g.scenes[g.scene??0].nodes)walk(n,Matrix4.IDENTITY);
 const min=[0,1,2].map(i=>points.reduce((v,p)=>Math.min(v,p[i]),Infinity)),max=[0,1,2].map(i=>points.reduce((v,p)=>Math.max(v,p[i]),-Infinity)),length=max[2]-min[2],width=max[0]-min[0];
 const mean=rows=>[0,1,2].map(i=>Number((rows.reduce((s,p)=>s+p[i],0)/rows.length).toFixed(3)));
 const center=points.filter(p=>Math.abs(p[0])<width*.08&&Math.abs(p[2])<length*.12),beacon=center.reduce((best,p)=>p[1]>best[1]?p:best,center[0]??[0,max[1]*.35,0]);
 const bellyAt=z=>{const rows=points.filter(p=>Math.abs(p[0])<width*.025&&Math.abs(p[2]-z)<length*.065);return rows.length?Math.min(...rows.map(p=>p[1])):min[1];};
 const mainZ=min[2]+length*.43,noseZ=max[2]-length*.18;
 const gear={main:[length*.07,bellyAt(mainZ),mainZ],nose:[0,bellyAt(noseZ),noseZ],strut:length*.035,radius:length*.012};
 if(!id.startsWith('fallback:'))gears[id]=gear;
 result[id]={length:Number(length.toFixed(3)),left:[max[0]+.08,...mean(points.filter(p=>p[0]>max[0]-width*.004)).slice(1)],right:[min[0]-.08,...mean(points.filter(p=>p[0]<min[0]+width*.004)).slice(1)],tail:mean(points.filter(p=>p[2]<min[2]+length*.004)),beacon:[beacon[0],beacon[1]+.12,beacon[2]]};
}
await fs.writeFile(new URL('src/lib/aircraftLightAnchors.json',root),JSON.stringify(result,null,2)+'\n');
console.log(`Measured light anchors for ${models.length} sourced/fallback airframes.`);

await fs.writeFile(new URL('src/lib/aircraftGearAnchors.json',root),JSON.stringify(gears,null,2)+'\n');
