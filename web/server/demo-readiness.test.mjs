import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {demoPlan,demoFleet,demoFrame,DEMO_MODELS} from '../src/lib/demoTraffic.ts';
import {graphicsPreset} from '../src/lib/adaptiveQuality.ts';
import {LiveMotion} from '../src/lib/liveMotion.ts';
import {AircraftAnimation} from '../src/lib/aircraftAnimation.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
import {bearing} from '../src/lib/flightPresentation.ts';
import {coverageMessage} from '../src/lib/coverageMessage.ts';
import {guidedStage} from '../src/lib/simulatorTraining.ts';
const airport=id=>({...JSON.parse(readFileSync(new URL(`../public/data/airports/${id}.json`,import.meta.url))),elevationFt:JSON.parse(readFileSync(new URL('../data/airport-elevations.json',import.meta.url)))[id]});
test('empty, loading and failed coverage stay distinguishable',()=>{assert.match(coverageMessage([],0,Date.now(),true,'',false,true).title,/Loading/);assert.match(coverageMessage([],0,Date.now(),false,'offline',false,true).title,/unavailable/);assert.match(coverageMessage([],0,Date.now(),false,'',false,true).title,/No aircraft reported/);});
test('graphics presets conserve battery without disabling selected aircraft or automatic adaptation',()=>{const low=graphicsPreset('battery');assert.equal(low.quality,'low');assert.equal(low.waterMotion,false);assert.equal(low.cityBuildings,false);assert.equal(low.autoQuality,true);assert.equal(graphicsPreset('high').shadows,true);});
for(const id of ['TAS','IAD','IST'])test(`fictional ${id} traffic covers the complete cycle with finite, continuous positions`,()=>{
 const p=demoPlan(airport(id));assert.ok(p);const fleet=demoFleet(id,7,p);assert.equal(fleet.length,6);assert.deepEqual(fleet,demoFleet(id,7,p));assert.notDeepEqual(fleet,demoFleet(id,8,p));assert.ok(fleet.every(f=>f.id.startsWith('skyward-demo-')&&f.destination!==id&&DEMO_MODELS.includes(f.model)));assert.ok(fleet.every(f=>!('observedAt' in f)&&!('hex' in f)));
 const phases=new Set();let previous;
 for(let t=0;t<p.end+46.5+181;t+=.5){const f=demoFrame(p,t);phases.add(f.phase);for(const k of ['lat','lon','altitude','heading','gear'])assert.ok(Number.isFinite(f[k]),`${id} ${k}`);assert.ok(f.altitude>=0);if(previous)assert.ok(trackDistance(previous,f)<.12,`${id}: discontinuity at ${t}`);previous=f;}
 for(const phase of ['landing','rollout','taxi in','parked at gate','pushback','taxi out','takeoff','airborne'])assert.ok(phases.has(phase),`${id}: missing ${phase}`);
});
for(const [id,type,speed] of [['IAD','B738',150],['IST','A21N',155],['TAS','E190',140],['DEN','C56X',130],['NRT','AT76',115]])test(`${id} ${type} watched arrival completes gear, rollout, taxi and parking at local elevation`,()=>{
 const port=airport(id),r=port.runways.find(r=>r.length>1800),heading=bearing({lon:r.a[0],lat:r.a[1]},{lon:r.b[0],lat:r.b[1]}),now=Date.now();assert.ok(Number.isFinite(port.elevationFt));
 const a={hex:'abcd01',callsign:'TEST101',aircraftType:type,targetKind:'aircraft',ground:false,lon:r.a[0]-Math.sin(heading*Math.PI/180)*3/60/Math.cos(r.a[1]*Math.PI/180),lat:r.a[1]-Math.cos(heading*Math.PI/180)*3/60,heading,altitude:port.elevationFt+1400,groundSpeed:speed,verticalRate:-700,observedAt:now};
 const route={callsign:a.callsign,status:'PLAUSIBLE',airports:[{iata:'OTHER',icao:'ZZZZ',lat:0,lon:0},{iata:id,icao:id,lat:port.lat,lon:port.lon}]},motion=new LiveMotion(),animation=new AircraftAnimation(),body={},phases=new Set(),original=structuredClone(a);motion.watch(a.hex);let previous,parked=false;
 for(let t=0;t<1800;t++){const frame=motion.sample(a,[],now+t*1000,false,route,port);assert.ok(frame.arrivalAnimation);assert.equal(frame.time,now);phases.add(frame.landingPhase);assert.equal(animation.sample(body,frame,now+t*1000).gear,1);if(previous){assert.ok(trackDistance(previous,frame)<.08);assert.ok(Math.abs(frame.altitude-previous.altitude)<45);}previous=frame;if(frame.landingPhase==='parked'){parked=true;break;}}
 assert.ok(parked);for(const phase of ['approach','rollout','taxi','parked'])assert.ok(phases.has(phase));assert.deepEqual(a,original);
});
test('Skyward brand assets keep rigged geometry and local texture references',()=>{for(const model of DEMO_MODELS){const g=JSON.parse(readFileSync(new URL(`../public/models/fleet/${model}-SKYWARD-v1.gltf`,import.meta.url)));assert.match(g.images[0].uri,/SKYWARD.png/);assert.ok(g.nodes.some(n=>n.name==='Gear'));for(const b of g.buffers){const bytes=readFileSync(new URL('../public/models/fleet/'+b.uri.split('?')[0],import.meta.url));assert.equal(bytes.length,b.byteLength);}}});
test('guided lesson advances from brakes to rotation, landing and taxi',()=>{
 const p={aircraftType:'B738'},s={warning:'',phase:'ready',ground:true,engineRunning:true,brakes:true};assert.equal(guidedStage(s,p).number,1);assert.equal(guidedStage({...s,brakes:false,speed:20},p).number,2);assert.equal(guidedStage({...s,brakes:false,speed:200},p).number,3);assert.equal(guidedStage({...s,ground:false,phase:'approach'},p).number,6);assert.equal(guidedStage({...s,phase:'landed'},p).number,8);
});
