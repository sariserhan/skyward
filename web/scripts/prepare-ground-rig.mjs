// Original illustrative flap rig for the optional ground simulation; no sourced mesh is edited.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../public/models/fleet/',import.meta.url),g=JSON.parse(await readFile(new URL('b737-neutral-v4.gltf',root),'utf8'));
const coordinates=new Float32Array([0,0,0, 6,0,-2, 6,0,-3.2, 0,0,0, 6,0,-3.2, 0,0,-1.2]);
const normals=new Float32Array(Array.from({length:6},()=>[0,1,0]).flat());const bytes=Buffer.concat([Buffer.from(coordinates.buffer),Buffer.from(normals.buffer)]),buffer=g.buffers.length;g.buffers.push({uri:'ground-flaps.bin',byteLength:bytes.length});
const indices=[];for(const [i,arr] of [coordinates,normals].entries()){const view=g.bufferViews.length;g.bufferViews.push({buffer,byteOffset:i*coordinates.byteLength,byteLength:arr.byteLength,target:34962});indices.push(g.accessors.length);g.accessors.push({bufferView:view,componentType:5126,count:6,type:'VEC3',...(i===0?{min:[0,0,-3.2],max:[6,0,0]}:{})});}
const mesh=g.meshes.length;g.meshes.push({primitives:[{attributes:{POSITION:indices[0],NORMAL:indices[1]},material:1}]});for(const side of [-1,1]){g.scenes[0].nodes.push(g.nodes.length);g.nodes.push({name:side<0?'FlapL':'FlapR',mesh,translation:[side*3,-.2,-4],scale:[side,1,1]});}
for(const material of g.materials)material.emissiveFactor=[.055,.06,.065];
g.asset.generator='Skyward illustrative ground rig with steerable nose wheel and flap hinges';await writeFile(new URL('ground-flaps.bin',root),bytes);await writeFile(new URL('ground-b737.gltf',root),JSON.stringify(g));
