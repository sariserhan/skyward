import {useEffect,useRef,useState} from 'react';
import {announcementVoice,speechErrorMessage} from '../lib/browserSpeech';
import {acquireSpeechFocus,onAudioMix,readAudioMix,saveAudioMix} from '../lib/audioMix';
import {TowerRadioPlanner,towerRadioPhase} from '../lib/towerRadio';
import {sharedLiveMotion} from '../lib/liveMotion';
import type {DialogueLine} from '../lib/flightDialogue';
import type {Aircraft} from '../types';
export type TowerDemoRadio={phase:string;playing:boolean};
export function TowerRadio({observations,demo,suspended}:{observations:Aircraft[];demo:TowerDemoRadio|null|undefined;suspended:boolean}){
 const [enabled,setEnabled]=useState(false),[caption,setCaption]=useState(''),[notice,setNotice]=useState(''),[volume,setVolume]=useState(()=>readAudioMix().radio);
 const demoMode=demo!==undefined;
 const latest=useRef({observations,demo,suspended,enabled});latest.current={observations,demo,suspended,enabled};
 const start=useRef<()=>void>(()=>{}),stop=useRef<()=>void>(()=>{});
 useEffect(()=>onAudioMix(()=>setVolume(readAudioMix().radio)),[]);
 useEffect(()=>{
  let planner=new TowerRadioPlanner(),queue:DialogueLine[]=[],owned:SpeechSynthesisUtterance|null=null,release:(()=>void)|null=null,last=0,started=0,disposed=false;
  const cancel=()=>{queue=[];const active=owned;owned=null;release?.();release=null;if(active&&'speechSynthesis' in window)window.speechSynthesis.cancel();};stop.current=cancel;
  const pump=()=>{
   const s=latest.current,now=Date.now();
   if(!s.enabled||s.suspended||document.hidden||s.demo!==undefined&&!s.demo?.playing){cancel();return;}
   if(readAudioMix().radio===0){cancel();setNotice('Radio is muted. Raise Radio volume to hear the dialogue.');return;}
   if(owned){if(now-started>45000){cancel();setNotice('Speech did not finish. Press Test radio to retry.');}return;}
   if(now-last<1400)return;
   if(!queue.length){const traffic=s.demo?[{identity:'demo',callsign:'Skyward demonstration',phase:towerRadioPhase(s.demo.phase)}]:s.observations.filter(a=>a.observedAt!==null&&now-a.observedAt<60000&&!a.positionWarning).map(a=>{
    const frame=sharedLiveMotion.displayed(a.hex);return {identity:a.hex,callsign:a.callsign||a.hex,phase:towerRadioPhase(frame?.landingPhase??((frame?.ground??a.ground)?(a.groundSpeed??0)>3?'taxi':'ground':(a.verticalRate??0)<-150?'approach':(a.verticalRate??0)>150?'climb':'airborne'))};
   });queue=planner.next(traffic,now);}
   if(!queue.length){setNotice('Listening for nearby traffic activity.');return;}
   if(!('speechSynthesis' in window)){setNotice('Speech unavailable in this browser. Transcript only.');const line=queue.shift()!;setCaption(`${line.speaker==='Tower'?'Tower':'Pilot'}: ${line.text}`);last=now;return;}
   const synth=window.speechSynthesis;if(synth.speaking||synth.pending)return;if(synth.paused)synth.resume();
   const line=queue.shift()!,u=new SpeechSynthesisUtterance(line.text);let preferred='';try{preferred=localStorage.getItem('skyward.voice.v1')??'';}catch{}
   const voice=announcementVoice(synth.getVoices(),preferred);if(voice)u.voice=voice;u.lang=voice?.lang??'en-US';u.volume=readAudioMix().radio*.8;u.rate=line.speaker==='Tower'?1.04:.95;u.pitch=line.speaker==='Tower'?1:.9;
   owned=u;started=now;setCaption(`${line.speaker==='Tower'?'Tower':'Pilot'}: ${line.text}`);setNotice('Starting radio speech…');
   const finish=()=>{if(owned!==u)return false;owned=null;release?.();release=null;last=Date.now();return true;};
   u.onstart=()=>{if(owned===u){release=acquireSpeechFocus();setNotice(`Speaking · ${line.speaker==='Tower'?'Tower':'Pilot'}`);}};
   u.onend=()=>{if(finish()&&!disposed)setNotice('');};u.onerror=e=>{if(finish()&&!disposed)setNotice(speechErrorMessage(e.error));};
   try{synth.speak(u);}catch{finish();setNotice(speechErrorMessage());}
  };
  start.current=()=>{cancel();planner=new TowerRadioPlanner();last=0;if('speechSynthesis' in window){window.speechSynthesis.cancel();window.speechSynthesis.resume();}queue=[{channel:'radio',speaker:'Tower',text:'Skyward tower radio check. Monitoring nearby traffic.'}];pump();};
  const timer=setInterval(pump,500),unmix=onAudioMix(()=>{if(readAudioMix().radio===0){cancel();setNotice('Radio is muted. Raise Radio volume to hear the dialogue.');}});
  const hide=()=>{if(document.hidden)cancel();};document.addEventListener('visibilitychange',hide);
  return()=>{disposed=true;clearInterval(timer);unmix();document.removeEventListener('visibilitychange',hide);cancel();start.current=()=>{};stop.current=()=>{};};
 },[demoMode]);
 const activate=()=>{latest.current.enabled=true;setEnabled(true);start.current();};
 return <section className="tower-radio" aria-label="Tower radio"><div className="flight-buttons"><button aria-pressed={enabled} disabled={suspended} onClick={()=>{if(enabled){latest.current.enabled=false;setEnabled(false);stop.current();setNotice('Radio off');}else activate();}}>Tower radio {enabled?'on':'off'}</button><button disabled={suspended} onClick={activate}>Test radio</button></div><label>Radio volume<input aria-label="Tower radio volume" type="range" min="0" max="1" step=".05" value={volume} onChange={e=>saveAudioMix({...readAudioMix(),radio:Number(e.target.value)})}/></label><small>Simulated tower calls and pilot readbacks for nearby traffic. Not live ATC. Browser voices may use an online speech service.</small>{caption&&<p aria-live="polite">{caption}</p>}{notice&&<small role="status">{notice}</small>}</section>;
}
