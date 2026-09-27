import {useEffect,useRef,useState} from 'react';
import {createCabinSound,readCabinAudio,saveCabinAudio,type CabinSound,type CabinSource} from '../lib/cabinAudio';
/** Audio-only control. Source is explicit so a requested recording is never silently replaced. */
export function CabinAudioSwitch({source,suspended=false}:{source:CabinSource;suspended?:boolean}){
 const [enabled,setEnabled]=useState(readCabinAudio),[needsGesture,setNeedsGesture]=useState(false);
 const sound=useRef<CabinSound|null>(null),current=useRef({enabled,suspended});current.current={enabled,suspended};
 const url=source.kind==='file'?source.url:null;
 useEffect(()=>{
  const audio=createCabinSound(url?{kind:'file',url}:{kind:'generated'});sound.current=audio;let active=true;
  const play=()=>{if(!current.current.enabled||current.current.suspended||document.hidden)return;void audio.start().then(()=>{if(active)setNeedsGesture(false);}).catch(()=>{if(active)setNeedsGesture(true);});};
  const visibility=()=>{if(document.hidden)audio.pause();else play();};
  document.addEventListener('pointerdown',play);document.addEventListener('keydown',play);document.addEventListener('visibilitychange',visibility);
  play();return()=>{active=false;document.removeEventListener('pointerdown',play);document.removeEventListener('keydown',play);document.removeEventListener('visibilitychange',visibility);audio.dispose();sound.current=null;};
 },[url]);
 useEffect(()=>{saveCabinAudio(enabled);if(!enabled||suspended)sound.current?.pause();else if(!document.hidden)void sound.current?.start().then(()=>setNeedsGesture(false)).catch(()=>setNeedsGesture(true));},[enabled,suspended]);
 return <button className="quiet-button cabin-audio-switch" role="switch" aria-label="Cabin audio" aria-checked={enabled} title={needsGesture?'Interact with the page to allow sound':'Toggle cabin audio'} onClick={()=>setEnabled(value=>!value)}>Cabin audio: {enabled?'On':'Off'}</button>;
}
