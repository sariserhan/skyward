/** Unmodified GPLv2 FlightGear texture assets, pinned and Git-object verified.
 * Historical/community liveries identify an operator, never a specific live registration.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'public/models/sourced/liveries');
await fs.mkdir(out,{recursive:true});
const sources=[
 {repo:'FGMEMBERS/737-800',commit:'9126249dd0236479ad723f3e7c4c7139455c7d81',license:'LICENSE',model:'b738',images:[0],entries:{THY:'THY-800',UAL:'UAL',AAL:'AAL',DAL:'DAL',KLM:'KLM-800',RYR:'RYR-800',QFA:'QFA-800',ASA:'ASA',CAL:'CAL',GIA:'GIA',KAL:'KAL',CMP:'CMP',MSR:'MSR new',TRA:'TRA-800'},folder:'Models/Liveries-800/'},
 {repo:'FGMEMBERS/A320-family',commit:'00038142d3443d7f4aec9410520df608e8ae7ba8',license:'COPYING',model:'a320',images:[0],entries:{AFR:'A320-AFR',BAW:'A320-BAW',DLH:'A320-DLH',EZY:'A320-EZY',UAL:'A320-UAL',ACA:'A320-ACA',DAL:'A320-DAL',JBU:'A320-231/JBU',WZZ:'A320-231/WZZ',ANZ:'A320-ANZ',EIN:'A320-EIN',IBE:'A320-IBE',FIN:'A320-FIN',SWR:'A320-SWR',IGO:'A320-IGO',TAP:'A320-211/A320-TAP-SA',AVA:'A320-AVA',VLG:'A320-211/VLG',NKS:'A320-231/NKS',JST:'A320-JST',TAM:'A320-231/A320-TAM-SA',VOI:'A320-231/VOI'},folder:'Models/Liveries/'}
];
const files=[],catalog=[];
for(const source of sources){
 const url=`https://raw.githubusercontent.com/${source.repo}/${source.commit}/`,tree=await (await fetch(`https://api.github.com/repos/${source.repo}/git/trees/${source.commit}?recursive=1`)).json();
 if(!Array.isArray(tree.tree)||tree.truncated)throw Error('Incomplete source tree');
 async function get(remote,local){
  const target=path.join(out,local);let bytes;try{bytes=await fs.readFile(target);}catch{const response=await fetch(url+remote);if(!response.ok)throw Error(`${response.status} ${remote}`);bytes=Buffer.from(await response.arrayBuffer());}
  const expected=tree.tree.find(f=>f.path===remote),hash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if(!expected||hash!==expected.sha)throw Error(`Hash mismatch: ${remote}`);
  await fs.writeFile(target,bytes);files.push({file:local,source:url+remote,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});return bytes;
 }
 await get(source.license,`${source.model}-LICENSE.txt`);
 for(const [operator,name] of Object.entries(source.entries)){
  const texture=`${source.model}-${operator}.png`;await get(source.folder+name+'.png',texture);
  const xml=tree.tree.find(f=>f.path===source.folder+name+'.xml');if(xml)await get(xml.path,`${source.model}-${operator}.xml`);
  const g=JSON.parse(await fs.readFile(path.join(out,'..',source.model+'-v1.gltf')));
  g.buffers=g.buffers.map(b=>({...b,uri:'../'+b.uri}));
  for(const i of source.images)g.images[i]={uri:texture};
  g.asset.copyright+=' Full livery textures: FlightGear contributors / '+source.repo+'; GPLv2.';
  g.extras.skyward.livery={operator,source:source.repo,commit:source.commit,license:'GPL-2.0',registrationMatch:false};
  const uri=`models/sourced/liveries/${source.model}-${operator}-v1.gltf`;
  await fs.writeFile(path.join(root,'public',uri),JSON.stringify(g));
  catalog.push({model:source.model,operator,uri,source:`https://github.com/${source.repo}/tree/${source.commit}`,license:'GPL-2.0'});
 }
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({description:'Unmodified community full-aircraft livery textures. May depict historical paint and a different registration. No registration match is asserted.',sources,files},null,2));
await fs.writeFile(path.join(root,'src/lib/fullLiveries.json'),JSON.stringify(catalog,null,2));
await fs.copyFile(fileURLToPath(import.meta.url),path.join(out,'import-liveries.mjs'));
console.log(`Imported ${catalog.length} full-aircraft liveries.`);
