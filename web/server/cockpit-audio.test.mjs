import test from 'node:test';
import assert from 'node:assert/strict';
import {cockpitAudioSettings,createCockpitSound} from '../src/lib/cockpitAudio.ts';
test('cockpit ambience responds to practice throttle and distinguishes propeller profiles',()=>{
 const base={speed:150,throttle:0,volume:.3};
 assert.ok(cockpitAudioSettings('B738',{...base,throttle:1}).frequency>cockpitAudioSettings('B738',base).frequency);
 assert.notEqual(cockpitAudioSettings('AT76',base).frequency,cockpitAudioSettings('B738',base).frequency);
 assert.equal(cockpitAudioSettings('B738',{...base,volume:0}).volume,0);
 for(const settings of [{speed:NaN,throttle:NaN,volume:NaN},{speed:null,throttle:null,volume:2}])assert.ok(Object.values(cockpitAudioSettings('UNKNOWN',settings)).every(Number.isFinite));
});
test('disposing during a pending audio start cannot revive playback or leak a context',async()=>{
 let resolveResume,closed=0,suspended=0,stopped=0;
 const node=()=>({connect(){return this;},disconnect(){},start(){},stop(){stopped++;},frequency:{value:0,setTargetAtTime(){}},gain:{value:0,setTargetAtTime(){}}});
 const original=globalThis.AudioContext;
 globalThis.AudioContext=class{state='suspended';sampleRate=8;currentTime=0;destination={};createGain=node;createBiquadFilter=node;createBufferSource=node;createOscillator=node;createBuffer(){return{getChannelData:()=>new Float32Array(32)}};resume(){return new Promise(resolve=>{resolveResume=resolve;});}async suspend(){suspended++;this.state='suspended';}async close(){closed++;this.state='closed';}};
 try{const sound=createCockpitSound('B738');const pending=sound.start();sound.dispose();resolveResume();await pending;assert.equal(closed,1);assert.equal(stopped,3);assert.equal(suspended,0);await sound.start();assert.equal(closed,1);}finally{globalThis.AudioContext=original;}
});
