import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraftFamily,propulsionSound} from '../src/lib/aircraftSound.ts';
import {cabinSoundProfile} from '../src/lib/cabinAudio.ts';
import {cockpitAudioSettings,createCockpitSound} from '../src/lib/cockpitAudio.ts';
test('rotorcraft, pistons and turboprops have distinct sound signatures without misclassifying jets',()=>{
 for(const type of ['B407','EC35','R44','H60'])assert.equal(aircraftFamily(type),'helicopter');
 for(const type of ['C172','PA28','SR22'])assert.equal(aircraftFamily(type),'piston');
 for(const type of ['AT76','DH8D','PC12'])assert.equal(aircraftFamily(type),'turboprop');
 for(const type of ['PC24','B738','B744','UNKNOWN'])assert.equal(aircraftFamily(type),'jet');
 const types=['B407','C172','AT76','B738'];
 assert.equal(new Set(types.map(t=>propulsionSound(t).beat)).size,4);
 assert.equal(new Set(types.map(t=>cabinSoundProfile({aircraftType:t,ground:false,speed:120}).frequency)).size,4);
 assert.equal(new Set(types.map(t=>cockpitAudioSettings(t,{speed:120,throttle:.5,volume:.5}).frequency)).size,4);
 for(const t of types){assert.equal(cockpitAudioSettings(t,{speed:120,throttle:.5,volume:0}).volume,0);assert.ok(cabinSoundProfile({aircraftType:t,ground:true,speed:0}).engine<cabinSoundProfile({aircraftType:t,ground:false,speed:120}).engine);}
});
test('rotor beat oscillators are stopped when cockpit audio is disposed',async()=>{
 let stopped=0,closed=0;const original=globalThis.AudioContext;
 const node=()=>({connect(){return this;},disconnect(){},start(){},stop(){stopped++;},frequency:{value:0,setTargetAtTime(){}},gain:{value:0,setTargetAtTime(){}}});
 globalThis.AudioContext=class{state='running';sampleRate=8;currentTime=0;destination={};createGain=node;createBiquadFilter=node;createBufferSource=node;createOscillator=node;createBuffer(){return{getChannelData:()=>new Float32Array(32)}};async resume(){}async suspend(){this.state='suspended'}async close(){closed++;this.state='closed'}};
 try{const sound=createCockpitSound('B407');await sound.start();sound.pause();sound.dispose();assert.equal(stopped,4);assert.equal(closed,1);}finally{globalThis.AudioContext=original;}
});
