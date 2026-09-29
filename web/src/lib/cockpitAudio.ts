import {readAudioMix,onAudioMix} from './audioMix.ts';
import {aircraftFamily,propulsionSound} from './aircraftSound.ts';
export type CockpitCue='gear'|'touchdown'|'turbulence'|500|100|50|40|30|20|10;
export interface AudioFlight {turbulence?:number;agl:number|null;ground:boolean;gear:boolean|null;at:number;}
export function cockpitCues(previous:AudioFlight|null,next:AudioFlight):CockpitCue[]{
 if(!previous||next.at-previous.at>5000||next.at<=previous.at)return [];
 const cues:CockpitCue[]=[];
 if(!next.ground&&(next.turbulence??0)>=.55&&(previous.turbulence??0)<.55)cues.push('turbulence');
 if(previous.gear!==null&&next.gear!==null&&previous.gear!==next.gear)cues.push('gear');
 if(!previous.ground&&next.ground&&previous.agl!==null&&previous.agl<100)cues.push('touchdown');
 if(!next.ground&&previous.agl!==null&&next.agl!==null&&previous.agl-next.agl<150){const crossed=([500,100,50,40,30,20,10] as const).filter(h=>previous.agl!>h&&next.agl!<=h);if(crossed.length)cues.push(crossed.at(-1)!);}
 return cues;
}
export interface CockpitAudioInput {turbulence?:number;speed:number|null;throttle:number|null;volume:number;}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function cockpitAudioSettings(type:string,input:CockpitAudioInput){
 const family=aircraftFamily(type),prop=family==='piston'||family==='turboprop',piston=family==='piston',helicopter=family==='helicopter';
 const business=/^(C[2567]|GL|FA|LJ)/i.test(type),heavy=/^(B74|B77|B78|A33|A34|A35|A38)/i.test(type);
 const base=helicopter?24:piston?30:prop?38:business?65:heavy?34:48,range=helicopter?14:piston?28:prop?42:business?80:heavy?45:62;
 const speed=Number.isFinite(input.speed)?clamp(input.speed!,0,600):0;
 const power=input.throttle!==null&&Number.isFinite(input.throttle)?clamp(input.throttle,0,1):clamp(.25+speed/700,.25,.85);
 return {frequency:base+power*range,hum:helicopter?.16:prop?.12:.07,wind:350+speed*2+clamp(input.turbulence??0,0,1)*1200,volume:Number.isFinite(input.volume)?clamp(input.volume,0,1)*.18:0};
}
/** Original illustrative engine/ventilation sound. No media or provider requests. */
export function createCockpitSound(type:string){
 let context:AudioContext|null=null,master:GainNode|null=null,low:BiquadFilterNode|null=null,humGain:GainNode|null=null,airGain:GainNode|null=null,beatDepth:GainNode|null=null;
 let disposed=false,wantsPlayback=false,input:CockpitAudioInput={speed:null,throttle:null,volume:.3};
 const sources:AudioScheduledSourceNode[]=[],oscillators:OscillatorNode[]=[],nodes:AudioNode[]=[];
 const update=(next:CockpitAudioInput)=>{input=next;if(!context||!master||!low||!humGain||context.state==='closed')return;const settings=cockpitAudioSettings(type,next),t=context.currentTime;master.gain.setTargetAtTime(wantsPlayback?settings.volume:0,t,.15);low.frequency.setTargetAtTime(settings.wind,t,.4);humGain.gain.setTargetAtTime(settings.hum*readAudioMix().engine,t,.25);beatDepth?.gain.setTargetAtTime(settings.hum*propulsionSound(type).depth*readAudioMix().engine,t,.25);airGain?.gain.setTargetAtTime(readAudioMix().cabin,t,.25);oscillators.forEach((o,i)=>o.frequency.setTargetAtTime(settings.frequency*(i?1.51:1),t,.4));};
 const stopMix=onAudioMix(()=>update(input));
 function initialize(){
  const c=new AudioContext();context=c;master=c.createGain();master.gain.value=0;master.connect(c.destination);low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=500;const high=c.createBiquadFilter();high.type='highpass';high.frequency.value=35;
  const buffer=c.createBuffer(1,c.sampleRate*4,c.sampleRate),data=buffer.getChannelData(0);let seed=8173;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
  const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;airGain=c.createGain();nodes.push(airGain);noise.connect(low).connect(high).connect(airGain).connect(master);noise.start();sources.push(noise);
  humGain=c.createGain();humGain.gain.value=.07;humGain.connect(master);for(let i=0;i<2;i++){const o=c.createOscillator();o.type=propulsionSound(type).wave;o.connect(humGain);o.start();oscillators.push(o);sources.push(o);}nodes.push(master,low,high,humGain);
  const signature=propulsionSound(type);if(signature.beat){const beat=c.createOscillator(),depth=c.createGain();beat.frequency.value=signature.beat;beatDepth=depth;depth.gain.value=cockpitAudioSettings(type,input).hum*signature.depth;beat.connect(depth).connect(humGain.gain);beat.start();sources.push(beat);nodes.push(depth);}
  update(input);
 }
 const cue=(kind:CockpitCue)=>{
  if(!context||!master||!wantsPlayback||context.state!=='running')return;
  const c=context,t=c.currentTime,o=c.createOscillator(),gain=c.createGain(),duration=kind==='gear'?1.1:kind==='touchdown'?.55:kind==='turbulence'?.65:.16;
  o.type=kind==='gear'?'triangle':'sine';o.frequency.setValueAtTime(kind==='gear'?95:kind==='touchdown'?65:kind==='turbulence'?520:700,t);o.frequency.exponentialRampToValueAtTime(kind==='gear'?42:kind==='touchdown'?25:kind==='turbulence'?390:500,t+duration);
  gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(kind==='touchdown'?.8:.3,t+.04);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
  o.connect(gain).connect(master);sources.push(o);o.onended=()=>{o.disconnect();gain.disconnect();const index=sources.indexOf(o);if(index>=0)sources.splice(index,1);};o.start();o.stop(t+duration);
 };
 return {update,cue,start:async()=>{if(disposed)return;wantsPlayback=true;if(!context)initialize();const c=context!;await c.resume();if(disposed||!wantsPlayback){if(c.state!=='closed')await c.suspend();return;}update(input);},pause:()=>{wantsPlayback=false;if(context&&context.state!=='closed'){master!.gain.value=0;void context.suspend().catch(()=>{});}},dispose:()=>{disposed=true;stopMix();wantsPlayback=false;for(const source of sources){try{source.stop();}catch{}source.disconnect();}for(const node of nodes)node.disconnect();if(context&&context.state!=='closed')void context.close().catch(()=>{});context=null;}};
}
