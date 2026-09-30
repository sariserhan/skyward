import test from 'node:test';
import assert from 'node:assert/strict';
import {announcementVoice,englishVoices,speechErrorMessage} from '../src/lib/browserSpeech.ts';
const voice=(id,localService,lang='en-US',standard=false)=>({voiceURI:id,localService,lang,default:standard});
test('Announcement selection prefers local English but supports browser-only voices and explicit choice',()=>{
 const remote=voice('browser',false),local=voice('local',true),french=voice('fr',true,'fr-FR');
 assert.equal(announcementVoice([remote]),remote);assert.equal(announcementVoice([remote,local]),local);assert.equal(announcementVoice([remote,local],'browser'),remote);assert.equal(announcementVoice([french,remote],'removed'),remote);assert.deepEqual(englishVoices([french,remote,voice('uk',true,'en_GB')]).map(v=>v.voiceURI),['browser','uk']);
});
test('An empty or non-English voice list allows the browser default instead of indefinitely waiting',()=>{
 assert.equal(announcementVoice([]),null);assert.equal(announcementVoice([voice('fr',true,'fr-FR')]),null);
 assert.match(speechErrorMessage('not-allowed'),/permission/);assert.match(speechErrorMessage('network'),/connection/);assert.match(speechErrorMessage('voice-unavailable'),/system voice/);
});
