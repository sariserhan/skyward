import {createWeatherSound} from './weatherAudio.ts';
import {propulsionSound} from './aircraftSound.ts';
/** Native cabin sound: either a supplied audio file or original synthesized ambience. */
export type CabinSource={kind:'file';url:string}|{kind:'generated'};
export type CabinFlight={ground:boolean;speed:number;phase?:string;aircraftType?:string};
function jetCabinProfile(flight:CabinFlight){
 const speed=Math.max(0,Number.isFinite(flight.speed)?flight.speed:0),parked=flight.phase==='parked'||(flight.ground&&speed<1);
 if(parked)return {wind:0,engine:.012,frequency:38,rolling:0,ventilation:.18};
 if(flight.ground)return {wind:.04,engine:.035,frequency:45+Math.min(speed,160)*.1,rolling:Math.min(.85,speed/160),ventilation:.18};
 return {wind:1,engine:.08,frequency:55,rolling:0,ventilation:.18};
}
export function cabinSoundProfile(flight:CabinFlight){
 const profile=jetCabinProfile(flight),family=propulsionSound(flight.aircraftType).family;
 if(family==='jet')return profile;
 const parked=flight.phase==='parked'||(flight.ground&&flight.speed<1);
 return {...profile,wind:profile.wind*.65,engine:profile.engine*(family==='helicopter'?2:1.5),frequency:parked?28:family==='helicopter'?34:family==='piston'?48:76};
}
export interface CabinSound {weather:(rain:number,storm:boolean)=>void;thunder:(distance:number)=>void;update:(flight:CabinFlight)=>void;start:()=>Promise<void>;pause:()=>void;dispose:()=>void;}
export const cabinAudioPreference='skyward.cabin-audio.v1';
export function readCabinAudio(){try{return localStorage.getItem(cabinAudioPreference)!=='off';}catch{return true;}}
export function saveCabinAudio(enabled:boolean){try{localStorage.setItem(cabinAudioPreference,enabled?'on':'off');}catch{/* Optional preference. */}}
function createDryCabinSound(source:CabinSource,aircraftType=''):Omit<CabinSound,'weather'|'thunder'>{
 if(source.kind==='file'){
  const audio=new Audio(source.url);audio.loop=true;audio.volume=.3;audio.preload='auto';
  const repeat=()=>{if(audio.currentTime>=300)audio.currentTime=0;};audio.addEventListener('timeupdate',repeat);
  let disposed=false;
  return {update:flight=>{audio.volume=flight.ground?(flight.speed<1?.08:.15):.3;},start:async()=>{if(!disposed)await audio.play();},pause:()=>audio.pause(),dispose:()=>{disposed=true;audio.pause();audio.removeEventListener('timeupdate',repeat);audio.removeAttribute('src');audio.load();}};
 }
 // Original ventilation noise and soft engine hum; no recording or external media.
 let context:AudioContext|null=null,gain:GainNode|null=null,disposed=false,wantsPlayback=false;
 const nodes:AudioScheduledSourceNode[]=[];
 let profile=cabinSoundProfile({ground:false,speed:400,aircraftType}),wind:GainNode|null=null,rolling:GainNode|null=null,ventilation:GainNode|null=null;const beats:GainNode[]=[];const engines:{osc:OscillatorNode;level:GainNode}[]=[];
 const apply=()=>{if(!context||context.state==='closed')return;const at=context.currentTime;const set=(param:AudioParam|undefined,value:number)=>{if(param){param.cancelScheduledValues(at);param.setTargetAtTime(value,at,.6);}};beats.forEach(level=>set(level.gain,profile.engine*propulsionSound(aircraftType).depth));set(wind?.gain,profile.wind);set(rolling?.gain,profile.rolling);set(ventilation?.gain,profile.ventilation);engines.forEach(({osc,level},i)=>{set(osc.frequency,profile.frequency+(i?32:0));set(level.gain,profile.engine);});};
 function initialize(){
  context=new AudioContext();gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);
  const noise=context.createBuffer(1,context.sampleRate*8,context.sampleRate),data=noise.getChannelData(0);let seed=4831;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
  const air=context.createBufferSource();air.buffer=noise;air.loop=true;
  const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=1100;
  const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=45;
  wind=context.createGain();wind.gain.value=0;air.connect(low).connect(high).connect(wind).connect(gain);air.start();nodes.push(air);
  for(const kind of ['rolling','ventilation'] as const){const src=context.createBufferSource(),filter=context.createBiquadFilter(),level=context.createGain();src.buffer=noise;src.loop=true;filter.type='lowpass';filter.frequency.value=kind==='rolling'?110:650;level.gain.value=0;src.connect(filter).connect(level).connect(gain);src.start();nodes.push(src);if(kind==='rolling')rolling=level;else ventilation=level;}
  for(const frequency of [55,87]){const hum=context.createOscillator(),level=context.createGain();hum.type=propulsionSound(aircraftType).wave;hum.frequency.value=frequency;level.gain.value=0;hum.connect(level).connect(gain);hum.start();nodes.push(hum);engines.push({osc:hum,level});const signature=propulsionSound(aircraftType);if(signature.beat){const beat=context.createOscillator(),depth=context.createGain();beat.frequency.value=signature.beat;depth.gain.value=0;beat.connect(depth).connect(level.gain);beat.start();nodes.push(beat);beats.push(depth);}}
  apply();
 }
 return {update:flight=>{profile=cabinSoundProfile({...flight,aircraftType});apply();},start:async()=>{if(disposed)return;wantsPlayback=true;if(!context)initialize();await context!.resume();if(disposed||!wantsPlayback){if(context&&context.state!=='closed')void context.suspend();return;}gain!.gain.cancelScheduledValues(context!.currentTime);gain!.gain.setTargetAtTime(.12,context!.currentTime,.2);},pause:()=>{wantsPlayback=false;if(context&&context.state!=='closed'){gain!.gain.cancelScheduledValues(context.currentTime);gain!.gain.setTargetAtTime(0,context.currentTime,.06);void context.suspend();}},dispose:()=>{disposed=true;for(const node of nodes){try{node.stop();}catch{/* Already stopped. */}node.disconnect();}if(context&&context.state!=='closed')void context.close();context=null;gain=null;}};
}

export function createCabinSound(source:CabinSource,aircraftType=''):CabinSound{
 const cabin=createDryCabinSound(source,aircraftType),weather=createWeatherSound();
 return {update:cabin.update,weather:weather.update,thunder:weather.thunder,start:async()=>{try{await Promise.all([cabin.start(),weather.start()]);}catch(error){cabin.pause();weather.pause();throw error;}},pause:()=>{cabin.pause();weather.pause();},dispose:()=>{cabin.dispose();weather.dispose();}};
}
