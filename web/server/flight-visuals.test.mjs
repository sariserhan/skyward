import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coverageSummary,flightFraming,illustrativeGear,wheelAngle,angleStep} from '../src/lib/flightVisuals.ts';
import {modelBudget,modelOpacity,modelRange,nearbyModelIds} from '../src/lib/modelBudget.ts';
import {fullLivery,fleetUri,fallbackFleetUri} from '../src/lib/flightPresentation.ts';
import {sourcedModel} from '../src/lib/sourcedModels.ts';
test('coverage freshness uses observation time and treats unknown timestamps separately',()=>{
 assert.deepEqual(coverageSummary([{observedAt:99000},{observedAt:40000},{observedAt:0},{observedAt:null}],130000),{fresh:0,aging:2,gap:1,unknown:1,newest:99000});
 assert.deepEqual(coverageSummary([],130000),{fresh:0,aging:0,gap:0,unknown:0,newest:null});
});
test('camera fits the usable desktop and mobile space and takes the short heading path',()=>{
 const desk=flightFraming(1200,900,{left:24,right:378,top:115,bottom:750},74,1.15,Math.PI/3);
 assert.ok(desk.cx>378+74&&desk.cx<1116);assert.ok(desk.range>150);
 const mobile=flightFraming(390,780,{left:10,right:380,top:460,bottom:760},74,1.15,Math.PI/3);
 assert.ok(mobile.cy>100&&mobile.cy<460);assert.ok(mobile.range>74);
 assert.equal(angleStep(359,1,.5),360);
});
test('illustrative gear extends before landing and retracts gradually after takeoff',()=>{
 assert.equal(illustrativeGear('takeoff',.5),1);assert.equal(illustrativeGear('takeoff',.9),0);
 assert.ok(illustrativeGear('takeoff',.69)>.4&&illustrativeGear('takeoff',.69)<.6);
 assert.equal(illustrativeGear('landing',.3),1);assert.equal(illustrativeGear('landing',0),0);
 assert.equal(wheelAngle(20,0,.4),0);assert.ok(wheelAngle(1,10,.4)>0);
});
test('model budgets are bounded and distance fades do not hide far symbols',()=>{
 assert.equal(modelBudget('low'),0);assert.equal(modelBudget('balanced'),3);assert.equal(modelBudget('high'),8);
 for(const selected of [true,false]){const end=modelRange(selected);assert.equal(modelOpacity(end,selected),0);assert.equal(modelOpacity(end*.5,selected),1);assert.ok(modelOpacity(end*.85,selected)>.4);}
});
test('full liveries only replace supported type/operator pairs and preserve aircraft geometry',()=>{
 const root=new URL('../public/',import.meta.url),catalog=JSON.parse(readFileSync(new URL('../src/lib/fullLiveries.json',import.meta.url)));
 assert.equal(catalog.length,12);assert.ok(fullLivery({aircraftType:'B738',callsign:'THY1'}));assert.equal(fullLivery({aircraftType:'A359',callsign:'THY1'}),null);
 for(const m of catalog){const file=new URL(m.uri,root),g=JSON.parse(readFileSync(file)),base=JSON.parse(readFileSync(new URL(`models/sourced/${m.model}-v1.gltf`,root)));assert.deepEqual(g.meshes,base.meshes);assert.deepEqual(g.nodes,base.nodes);assert.equal(g.extras.skyward.livery.registrationMatch,false);for(const image of g.images??[])if(image.uri)assert.ok(readFileSync(new URL(image.uri,file)).length>0);}
 assert.equal(sourcedModel('A3ST').id,'beluga');assert.equal(sourcedModel('AS21').id,'ask21');assert.equal(sourcedModel('B463').match,'family');
});
test('rigged fallback wheels rotate around local axles under the gear parent',()=>{
 const g=JSON.parse(readFileSync(new URL('../public/'+fallbackFleetUri({aircraftType:'B38M',callsign:'THY1'}),import.meta.url)));
 const gear=g.nodes.find(n=>n.name==='Gear');assert.equal(gear.children.length,3);
 for(const index of gear.children){const n=g.nodes[index];assert.match(n.name,/^Wheel[LRN]$/);assert.ok(n.translation[1]<0);for(const primitive of g.meshes[n.mesh].primitives){const a=g.accessors[primitive.attributes.POSITION];assert.ok(a.max.every(v=>v<=.41));assert.ok(a.min.every(v=>v>=-.41));}}
 assert.match(fallbackFleetUri({aircraftType:'B38M',callsign:'THY1'}),/-v4.gltf\?tail=2$/);
});

test('tower retains bounded detailed traffic at approach distances even on low quality',()=>{
 const rows=Array.from({length:12},(_,i)=>({id:String(i),distance:3000+i*1000,loaded:false,visible:true}));
 assert.equal(modelBudget('low',true),3);
 assert.equal(modelRange(false,true),20000);
 assert.deepEqual(nearbyModelIds(rows,modelBudget('low',true),true),['0','1','2']);
 assert.deepEqual(nearbyModelIds(rows,modelBudget('high')),[]);
 assert.equal(modelOpacity(6000,false,true),1);assert.equal(modelOpacity(20000,false,true),0);
});
