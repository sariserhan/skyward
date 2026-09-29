import test from 'node:test';import assert from 'node:assert/strict';
import {readAudioMix,readAmbienceMix,saveAudioMix,acquireSpeechFocus,onAudioMix,audioPresets} from '../src/lib/audioMix.ts';
test('overlapping speech focus restores sound only after every owner releases and preserves preferences',()=>{
 saveAudioMix(audioPresets.Balanced);let events=0;const off=onAudioMix(()=>events++);
 const first=acquireSpeechFocus(),second=acquireSpeechFocus();
 try{assert.equal(readAmbienceMix().cabin,.28);assert.equal(readAudioMix().cabin,1);assert.equal(readAmbienceMix().radio,1);
 first();first();assert.equal(readAmbienceMix().engine,.45);saveAudioMix(audioPresets['Quiet cabin']);assert.equal(readAmbienceMix().engine,.3*.45);
 second();assert.deepEqual(readAmbienceMix(),audioPresets['Quiet cabin']);assert.equal(events,5);
 }finally{first();second();off();saveAudioMix(audioPresets.Balanced);}
});
test('speech focus expires even when a browser never sends a completion callback',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const release=acquireSpeechFocus();
 try{assert.equal(readAmbienceMix().weather,.4);t.mock.timers.tick(45001);assert.equal(readAmbienceMix().weather,1);}finally{release();t.mock.timers.reset();}
});
