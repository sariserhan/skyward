/** Keep the requested installed voices; never silently choose a removed voice. */
export function flightVoices(voices:readonly SpeechSynthesisVoice[]){
 return voices.filter(v=>/^Google\b/i.test(v.name)||/^(Tessa|Fred|Ralph|Karen)(?:$|[ (])/i.test(v.name));
}
export function announcementVoice(voices:readonly SpeechSynthesisVoice[],preferred=''){
 const allowed=flightVoices(voices),english=allowed.filter(v=>/^en(?:[-_]|$)/i.test(v.lang));
 return allowed.find(v=>v.voiceURI===preferred)??english.find(v=>v.localService&&v.default)??english.find(v=>v.localService)??english[0]??allowed[0]??null;
}

export function speechErrorMessage(code?:string){
 if(code==='not-allowed')return 'The browser blocked speech. Press Test voice again and check this site’s sound permission.';
 if(code==='audio-busy')return 'The audio output is busy. Close another speaking tab, then press Test voice.';
 if(code==='network')return 'The selected browser voice needs a connection. Choose an available local voice and retry.';
 if(code==='voice-unavailable'||code==='language-unavailable'||code==='synthesis-unavailable')return 'This browser could not provide a speech voice. Enable a Google, Tessa, Fred, Ralph or Karen voice on this device, then retry.';
 if(code==='audio-hardware')return 'The browser could not use your audio output. Check your headphones or speaker output and retry.';
 if(code==='canceled'||code==='interrupted')return 'Speech was interrupted. Press Captain update to repeat it.';
 return 'Speech did not play. Choose an available voice and press Test voice; check the browser’s sound permission and your audio output.';
}
