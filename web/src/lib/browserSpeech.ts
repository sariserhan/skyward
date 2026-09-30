/** Prefer local English speech, but do not reject browser/OS voices or an unloaded list. */
export function englishVoices(voices:readonly SpeechSynthesisVoice[]){return voices.filter(v=>/^en(?:[-_]|$)/i.test(v.lang));}
export function announcementVoice(voices:readonly SpeechSynthesisVoice[],preferred=''){
 const english=englishVoices(voices);
 return english.find(v=>v.voiceURI===preferred)??english.find(v=>v.localService&&v.default)??english.find(v=>v.localService)??english.find(v=>v.default)??english[0]??null;
}
export function speechErrorMessage(code?:string){
 if(code==='not-allowed')return 'The browser blocked speech. Press Test voice again and check this site’s sound permission.';
 if(code==='audio-busy')return 'The audio output is busy. Close another speaking tab, then press Test voice.';
 if(code==='network')return 'The selected browser voice needs a connection. Choose a local voice or System default and retry.';
 if(code==='voice-unavailable'||code==='language-unavailable'||code==='synthesis-unavailable')return 'This browser could not provide a speech voice. Choose System default or install an English system voice, then retry.';
 if(code==='audio-hardware')return 'The browser could not use your audio output. Check your headphones or speaker output and retry.';
 if(code==='canceled'||code==='interrupted')return 'Speech was interrupted. Press Captain update to repeat it.';
 return 'Speech did not play. Try System default and Test voice; check the browser’s sound permission and your audio output.';
}
