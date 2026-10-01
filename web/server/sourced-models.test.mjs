import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {sourcedCatalog,sourcedModel} from '../src/lib/sourcedModels.ts';
import {fleetUri,fallbackFleetUri,fleetProfile} from '../src/lib/flightPresentation.ts';
const base=new URL('../public/',import.meta.url);
test('sourced aircraft have explicit type mappings, family aliases and honest unsupported-type fallbacks',()=>{
 assert.equal(sourcedCatalog.length,65);
 for(const [type,id] of [['A320','a320'],['B738','b738'],['B788','b788'],['CRJ9','crj900'],['BCS3','cs300']]){assert.equal(sourcedModel(type).id,id);assert.equal(sourcedModel(type).match,'type');assert.ok(fleetUri({aircraftType:type,callsign:'THY1'}).startsWith('models/sourced/'));}
 assert.equal(sourcedModel('B77W').match,'family');assert.equal(sourcedModel('B77W').id,'b773');
 assert.equal(sourcedModel('B38M').id,'b39m');assert.equal(sourcedModel('B38M').match,'family');assert.equal(sourcedModel('ZZZZ'),null);assert.equal(fleetUri({aircraftType:'B38M',callsign:'RYR1'}),'models/sourced/branded/b39m-RYR-v1.gltf?tail=2');
});
test('every converted model has local buffers, bounded geometry, credits, license and editable source',()=>{
 const manifest=JSON.parse(readFileSync(new URL('models/sourced/manifest.json',base)));
 assert.equal(manifest.commit,'dd53267690c6a4ecbb290a3acf0284333a5d68a9');assert.match(readFileSync(new URL('models/sourced/LICENSE.txt',base),'utf8'),/GNU GENERAL PUBLIC LICENSE/);
 for(const m of sourcedCatalog){
  const file=new URL(m.uri,base),g=JSON.parse(readFileSync(file));assert.equal(g.asset.version,'2.0');assert.ok(g.asset.copyright);assert.ok(m.length>4&&m.length<90);assert.ok(['GPL-2.0','GPL-3.0'].includes(g.extras.skyward.license));
  for(const buffer of g.buffers){assert.ok(!buffer.uri.includes('://'));assert.equal(readFileSync(new URL(buffer.uri,file)).length,buffer.byteLength);}
  for(const image of g.images??[]){assert.ok(image.bufferView!==undefined||image.uri?.startsWith('data:'));assert.ok(!(image.bufferView!==undefined&&image.uri!==undefined),'Embedded images must not share a placeholder URI cache key');}
  const info=manifest.models.find(x=>x.id===m.id);assert.ok(info.editableSources.some(s=>/\.(blend|ac)$/.test(s)));for(const source of info.editableSources)assert.ok(existsSync(new URL(source,base)));
 }
});

test('unverified MAX geometry and related variants remain explicit family matches',()=>{for(const type of ['B37M','B38M','B39M','B3XM','A20N','A21N','B78X','AT76'])assert.equal(sourcedModel(type).match,'family');assert.match(sourcedModel('B38M').fidelityNote,/unverified/);});

test('expanded aircraft use dedicated geometry across business, propeller, cargo and rotorcraft categories',()=>{
 for(const [type,id] of [['DC6','dc6'],['C750','c750'],['FA50','fa50'],['C182','c182'],['C208','c208'],['PC12','pc12'],['MD11','md11'],['DHC4','dhc4'],['AT75','atr72'],['E75L','e175'],['EC35','ec35']]){assert.equal(sourcedModel(type)?.id,id);assert.equal(sourcedModel(type)?.match,'type');assert.ok(existsSync(new URL(fleetUri({aircraftType:type,callsign:'THY1'}),base)));}
 assert.equal(sourcedModel('AT76').id,'atr72');assert.equal(sourcedModel('E35L').id,'e145');assert.equal(sourcedModel('GLF6'),null);
 const allTypes=sourcedCatalog.flatMap(m=>m.types);assert.equal(new Set(allTypes).size,allTypes.length,'Each exact type has a single authoritative mapping');
});

test('new collection bakes node transforms so Cesium bounds enclose the whole aircraft',()=>{
 const manifest=JSON.parse(readFileSync(new URL('models/sourced/manifest.json',base)));
 for(const m of manifest.models.filter(m=>m.sourceRepository?.includes('FlightAirMap'))){
  const g=JSON.parse(readFileSync(new URL(m.uri,base)));const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const n of g.nodes){assert.equal(n.rotation,undefined);assert.equal(n.translation,undefined);assert.equal(n.scale,undefined);if(n.matrix)assert.deepEqual(n.matrix,identity);}
  const accessors=g.meshes.flatMap(mesh=>mesh.primitives.map(p=>g.accessors[p.attributes.POSITION]));
  const min=Math.min(...accessors.map(a=>a.min[2])),max=Math.max(...accessors.map(a=>a.max[2]));
  assert.ok(Math.abs(max-min-m.length)<.02,`${m.id}: entire fuselage must contribute to bounds`);
  assert.ok(Math.abs(min+max)<.01,`${m.id}: horizontal origin must remain centered`);
 }
});

test('new helicopter and twin-prop assets resolve exactly; older variants remain family matches',()=>{
 for(const type of ['B407','C421']){assert.equal(sourcedModel(type).match,'type');assert.ok(existsSync(new URL(sourcedModel(type).uri,base)));}
 for(const type of ['B733','B742','RJ85','A342','C551'])assert.equal(sourcedModel(type).match,'family');
});

test('expanded variants retain their actual names and appropriate fallback classes',async()=>{
 const {aircraftNames}=await import('../src/lib/aircraft.ts');
 assert.equal(aircraftNames.B733,'Boeing 737-300');
 assert.equal(aircraftNames.B74S,'Boeing 747SP');
 assert.equal(fleetProfile('B733'),'b737');
 assert.equal(fleetProfile('GLF6'),'bizjet');
 assert.equal(fleetProfile('DHC6'),'turboprop');
 assert.equal(fleetProfile('C172'),'light');
 assert.equal(sourcedModel('GLF6'),null);
});
