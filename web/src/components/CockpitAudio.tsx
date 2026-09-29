import {readAudioMix,acquireSpeechFocus} from '../lib/audioMix';
import {AudioMixer} from './AudioMixer';
import {useEffect,useRef,useState} from 'react';
import {cockpitCues,createCockpitSound,type AudioFlight} from '../lib/cockpitAudio';
function preferences(){try{const p=JSON.parse(localStorage.getItem('skyward.cockpit-audio.v1')??'null');return {enabled:p?.enabled!==false,callouts:p?.callouts===true,volume:typeof p?.volume==='number'&&Number.isFinite(p.volume)?Math.max(0,Math.min(1,p.volume)):.3};}catch{return {enabled:true,callouts:false,volume:.3};}}
export function CockpitAudio({aircraftType,speed,throttle,suspended,flight}:{flight:AudioFlight;aircraftType:string;speed:number|null;throttle:number|null;suspended:boolean}){
 const [settings,setSettings]=useState(preferences),[blocked,setBlocked]=useState(false),sound=useRef<ReturnType<typeof createCockpitSound>|null>(null);
 const releaseSpeech=useRef<(()=>void)|null>(null);
 const previous=useRef<AudioFlight|null>(null),spoken=useRef<SpeechSynthesisUtterance|null>(null);
 const [lastCue,setLastCue]=useState(''),lastTurbulence=useRef(-Infinity);
 const stopVoice=()=>{releaseSpeech.current?.();releaseSpeech.current=null;if(spoken.current&&'speechSynthesis' in window){window.speechSynthesis.cancel();spoken.current=null;}};
 const state=useRef({settings,suspended});state.current={settings,suspended};
 useEffect(()=>{const audio=createCockpitSound(aircraftType);sound.current=audio;let active=true;const start=()=>{if(!state.current.settings.enabled||state.current.suspended||document.hidden)return;void audio.start().then(()=>{if(active)setBlocked(false);}).catch(()=>{if(active)setBlocked(true);});};const visibility=()=>{if(document.hidden){audio.pause();stopVoice();previous.current=null;}else start();};document.addEventListener('pointerdown',start);document.addEventListener('keydown',start);document.addEventListener('visibilitychange',visibility);start();return()=>{active=false;document.removeEventListener('pointerdown',start);document.removeEventListener('keydown',start);document.removeEventListener('visibilitychange',visibility);audio.dispose();stopVoice();sound.current=null;};},[aircraftType]);
 useEffect(()=>{sound.current?.update({speed,throttle,volume:settings.volume,turbulence:flight.turbulence});},[speed,throttle,settings.volume,aircraftType,flight.turbulence]);
 useEffect(()=>{try{localStorage.setItem('skyward.cockpit-audio.v1',JSON.stringify(settings));}catch{}let active=true;if(!settings.enabled||suspended||document.hidden)sound.current?.pause();else void sound.current?.start().then(()=>{if(active)setBlocked(false);}).catch(()=>{if(active)setBlocked(true);});return()=>{active=false;};},[settings,suspended]);
 useEffect(()=>{
  const before=previous.current;previous.current=flight;if(!settings.callouts)stopVoice();
  if(!settings.enabled||suspended||document.hidden||blocked){stopVoice();return;}
  for(const cue of cockpitCues(before,flight)){
   if(typeof cue==='number'&&!settings.callouts)continue;
   if(cue==='turbulence'){if(flight.at-lastTurbulence.current<30000)continue;lastTurbulence.current=flight.at;}
   sound.current?.cue(cue);setLastCue(typeof cue==='number'?`${cue} feet · illustrative`:cue==='turbulence'?'Turbulence · fasten seat belts · simulated cue':cue==='gear'?'Gear movement · illustrative':'Touchdown · illustrative');
   if(typeof cue==='number'&&'speechSynthesis' in window){const voice=window.speechSynthesis.getVoices().find(v=>v.localService&&v.lang.startsWith('en'));if(voice){stopVoice();const utterance=new SpeechSynthesisUtterance(String(cue));utterance.voice=voice;utterance.volume=settings.volume*readAudioMix().radio;utterance.rate=1.05;spoken.current=utterance;const finish=()=>{if(spoken.current===utterance){spoken.current=null;releaseSpeech.current?.();releaseSpeech.current=null;}};utterance.onstart=()=>{if(spoken.current===utterance)releaseSpeech.current=acquireSpeechFocus();};utterance.onend=utterance.onerror=finish;try{if(utterance.volume>0)window.speechSynthesis.speak(utterance);else finish();}catch{finish();}}}
  }
 },[flight,settings,suspended,blocked]);
 const toggle=()=>{if(blocked&&settings.enabled){void sound.current?.start().then(()=>setBlocked(false)).catch(()=>setBlocked(true));}else setSettings(s=>({...s,enabled:!s.enabled}));};
 return <div className="cockpit-audio"><AudioMixer/><button role="switch" aria-label="Cockpit audio" aria-checked={settings.enabled&&!blocked} onClick={toggle}>{blocked&&settings.enabled?'Enable cockpit audio':`Cockpit audio: ${settings.enabled?'On':'Off'}`}</button><label>Volume<input aria-label="Cockpit audio volume" type="range" min="0" max="1" step=".05" value={settings.volume} onChange={e=>setSettings(s=>({...s,volume:Number(e.target.value)}))}/></label><label><input type="checkbox" aria-label="Altitude callouts" checked={settings.callouts} onChange={e=>setSettings(s=>({...s,callouts:e.target.checked}))}/>Altitude callouts</label>{(flight.turbulence??0)>=.55&&<strong className="turbulence-caution" role="status">Turbulence effect · fasten seat belts</strong>}<small>{lastCue||'Synthesized engine & airflow · local voice or chime callouts'}</small></div>;
}
