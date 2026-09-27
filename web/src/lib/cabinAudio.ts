/** Native cabin sound: either a supplied audio file or original synthesized ambience. */
export type CabinSource={kind:'file';url:string}|{kind:'generated'};
export interface CabinSound {start:()=>Promise<void>;pause:()=>void;dispose:()=>void;}
export const cabinAudioPreference='skyward.cabin-audio.v1';
export function readCabinAudio(){try{return localStorage.getItem(cabinAudioPreference)!=='off';}catch{return true;}}
export function saveCabinAudio(enabled:boolean){try{localStorage.setItem(cabinAudioPreference,enabled?'on':'off');}catch{/* Optional preference. */}}
export function createCabinSound(source:CabinSource):CabinSound{
 if(source.kind==='file'){
  const audio=new Audio(source.url);audio.loop=true;audio.volume=.3;audio.preload='auto';
  const repeat=()=>{if(audio.currentTime>=300)audio.currentTime=0;};audio.addEventListener('timeupdate',repeat);
  let disposed=false;
  return {start:async()=>{if(!disposed)await audio.play();},pause:()=>audio.pause(),dispose:()=>{disposed=true;audio.pause();audio.removeEventListener('timeupdate',repeat);audio.removeAttribute('src');audio.load();}};
 }
 // Original ventilation noise and soft engine hum; no recording or external media.
 let context:AudioContext|null=null,gain:GainNode|null=null,disposed=false,wantsPlayback=false;
 const nodes:AudioScheduledSourceNode[]=[];
 function initialize(){
  context=new AudioContext();gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);
  const noise=context.createBuffer(1,context.sampleRate*8,context.sampleRate),data=noise.getChannelData(0);let seed=4831;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
  const air=context.createBufferSource();air.buffer=noise;air.loop=true;
  const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=1100;
  const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=45;
  air.connect(low).connect(high).connect(gain);air.start();nodes.push(air);
  for(const frequency of [55,87]){const hum=context.createOscillator(),level=context.createGain();hum.frequency.value=frequency;level.gain.value=.08;hum.connect(level).connect(gain);hum.start();nodes.push(hum);}
 }
 return {start:async()=>{if(disposed)return;wantsPlayback=true;if(!context)initialize();await context!.resume();if(disposed||!wantsPlayback){if(context&&context.state!=='closed')void context.suspend();return;}gain!.gain.cancelScheduledValues(context!.currentTime);gain!.gain.setTargetAtTime(.12,context!.currentTime,.2);},pause:()=>{wantsPlayback=false;if(context&&context.state!=='closed'){gain!.gain.cancelScheduledValues(context.currentTime);gain!.gain.setTargetAtTime(0,context.currentTime,.06);void context.suspend();}},dispose:()=>{disposed=true;for(const node of nodes){try{node.stop();}catch{/* Already stopped. */}node.disconnect();}if(context&&context.state!=='closed')void context.close();context=null;gain=null;}};
}
