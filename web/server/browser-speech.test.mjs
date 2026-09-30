import test from 'node:test';
import assert from 'node:assert/strict';
import {announcementVoice,flightVoices,speechErrorMessage} from '../src/lib/browserSpeech.ts';
const voice=(name,localService=true,lang='en-US')=>({name,voiceURI:name,localService,lang,default:false});
test('Only Google and requested named voices are available, including all Google languages',()=>{
 const voices=['Tessa','Fred','Ralph','Karen','Karen (Enhanced)','Samantha','Alex'].map(n=>voice(n));
 voices.push(voice('Google UK English Male',false,'en-GB'),voice('Google français',false,'fr-FR'));
 assert.deepEqual(flightVoices(voices).map(v=>v.name),['Tessa','Fred','Ralph','Karen','Karen (Enhanced)','Google UK English Male','Google français']);
 assert.equal(announcementVoice(voices,'Samantha').name,'Tessa');
 assert.equal(announcementVoice(voices,'Google français').name,'Google français');
});
test('No implicit removed-voice fallback when supported voices are unavailable',()=>{
 assert.equal(announcementVoice([]),null);assert.equal(announcementVoice([voice('Samantha')]),null);
 assert.match(speechErrorMessage('not-allowed'),/permission/);assert.match(speechErrorMessage('network'),/connection/);
});
