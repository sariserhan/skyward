import {AudioMixer} from './AudioMixer';
import {readWeatherAudio} from '../lib/weatherAudio';
import {useEffect,useRef,useState} from 'react';
import {createCabinSound,readCabinAudio,saveCabinAudio,type CabinSound,type CabinSource,type CabinFlight} from '../lib/cabinAudio';
/** Audio-only control. Source is explicit so a requested recording is never silently replaced. */
export function CabinAudioSwitch({viewer,source,suspended=false,ground=false,speed=0,phase,aircraftType=''}:{viewer?:object|null;source:CabinSource;suspended?:boolean;ground?:boolean;speed?:number;phase?:string;aircraftType?:string}){
 const [enabled,setEnabled]=useState(readCabinAudio),[needsGesture,setNeedsGesture]=useState(false);
 const flight=useRef<CabinFlight>({ground,speed,phase});flight.current={ground,speed,phase};
 const sound=useRef<CabinSound|null>(null),current=useRef({enabled,suspended});current.current={enabled,suspended};
 useEffect(()=>{let lastStrike='';const update=()=>{const cue=viewer?readWeatherAudio(viewer):undefined;sound.current?.weather(cue?.rain??0,cue?.storm??false);const strike=cue?.strike,key=strike?`${strike.at}:${strike.id}`:'';if(key&&key!==lastStrike){lastStrike=key;if(current.current.enabled&&!current.current.suspended&&!document.hidden&&Date.now()-strike!.at<1500)sound.current?.thunder(strike!.distance);}};update();const timer=setInterval(update,200);return()=>clearInterval(timer);},[viewer]);
 const url=source.kind==='file'?source.url:null;
 useEffect(()=>{
  const audio=createCabinSound(url?{kind:'file',url}:{kind:'generated'},aircraftType);sound.current=audio;audio.update(flight.current);let active=true;
  const play=()=>{if(!current.current.enabled||current.current.suspended||document.hidden)return;void audio.start().then(()=>{if(active)setNeedsGesture(false);}).catch(()=>{if(active)setNeedsGesture(true);});};
  const visibility=()=>{if(document.hidden)audio.pause();else play();};
  document.addEventListener('pointerdown',play);document.addEventListener('keydown',play);document.addEventListener('visibilitychange',visibility);
  play();return()=>{active=false;document.removeEventListener('pointerdown',play);document.removeEventListener('keydown',play);document.removeEventListener('visibilitychange',visibility);audio.dispose();sound.current=null;};
 },[url,aircraftType]);
 useEffect(()=>{sound.current?.update({ground,speed,phase});},[ground,speed,phase]);
 useEffect(()=>{saveCabinAudio(enabled);if(!enabled||suspended)sound.current?.pause();else if(!document.hidden)void sound.current?.start().then(()=>setNeedsGesture(false)).catch(()=>setNeedsGesture(true));},[enabled,suspended]);
 return <><button className="quiet-button cabin-audio-switch" role="switch" aria-label="Cabin audio" aria-checked={enabled} title={needsGesture?'Interact with the page to allow sound':'Toggle cabin audio'} onClick={()=>setEnabled(value=>!value)}>Cabin audio: {enabled?'On':'Off'}</button><AudioMixer/></>;
}
