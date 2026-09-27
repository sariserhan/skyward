import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fleetUri,sourcedModel} from '../src/lib/flightPresentation.ts';
const root=new URL('../public/',import.meta.url),report=JSON.parse(readFileSync(new URL('models/sourced/branded/manifest.json',root)));
test('tail branding uses the operator and actual sourced model; unknown operators keep source paint',()=>{
 assert.match(fleetUri({aircraftType:'B77W',callsign:'THY123'}),/branded\/b773-THY-v1.gltf$/);
 assert.match(fleetUri({aircraftType:'B738',callsign:'UAL123'}),/liveries\/b738-UAL-v1.gltf$/);
 assert.equal(fleetUri({aircraftType:'A320',callsign:'UNKNOWN'}),sourcedModel('A320').uri);
});
test('all branded variants preserve original aircraft meshes and reference local, unchanged logo textures',()=>{
 assert.equal(report.models.length,62);
 for(const m of report.models){
  const base=JSON.parse(readFileSync(new URL(`models/sourced/${m.id}-v1.gltf`,root)));assert.equal(m.operators.length,24);
  for(const operator of m.operators){const url=new URL(`models/sourced/branded/${m.id}-${operator}-v1.gltf`,root),g=JSON.parse(readFileSync(url));
   assert.deepEqual(g.meshes.slice(0,base.meshes.length),base.meshes);assert.deepEqual(g.nodes.slice(0,base.nodes.length),base.nodes);
   assert.equal(g.extras.skyward.operator,operator);assert.equal(g.extras.skyward.license,base.extras.skyward.license);assert.ok(g.nodes.some(n=>n.name==='AirlineTailBranding'));
   for(const b of g.buffers)assert.ok(existsSync(new URL(b.uri,url)));
   assert.equal(new URL(g.images.at(-1).uri,url).href,new URL(`airlines/${operator}.png`,root).href);
  }
 }
});
test('both fin faces receive readable, bounded UVs with opposite horizontal orientation',()=>{
 for(const m of report.models){
  const file=new URL(`models/sourced/branded/${m.id}-THY-v1.gltf`,root),g=JSON.parse(readFileSync(file)),p=g.meshes.at(-1).primitives[1];
  const get=(index,dim)=>{const a=g.accessors[index],v=g.bufferViews[a.bufferView],data=readFileSync(new URL(g.buffers[v.buffer].uri,file));return Array.from({length:a.count},(_,i)=>Array.from({length:dim},(_,j)=>data.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+(i*dim+j)*4)));};
  const positions=get(p.attributes.POSITION,3),normals=get(p.attributes.NORMAL,3),uv=get(p.attributes.TEXCOORD_0,2);assert.ok(normals.some(n=>n[0]>0)&&normals.some(n=>n[0]<0));
  for(let i=0;i<uv.length;i++){assert.ok(uv[i].every(v=>v>=-1e-5&&v<=1.00001));const side=normals[i][0],fraction=(positions[i][2]-(m.placement.z-m.placement.size/2))/m.placement.size;assert.ok(Math.abs(uv[i][0]-((side>0?1:0)-side*fraction))<1e-4);}
 }
});
