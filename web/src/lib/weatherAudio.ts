import {readAmbienceMix,onAudioMix} from './audioMix.ts';
/** Shared visual-weather cues. Audio consumers never make weather requests. */
export type WeatherAudioCue={rain:number;storm:boolean;strike?:{id:number;at:number;distance:number}};
const cues=new WeakMap<object,WeatherAudioCue>();
export function publishWeatherAudio(viewer:object,rain:number,storm:boolean){const previous=cues.get(viewer);cues.set(viewer,{rain:Math.max(0,Math.min(1,rain)),storm,strike:storm?previous?.strike:undefined});}
export function publishThunder(viewer:object,distance:number){const current=cues.get(viewer);if(current?.storm)current.strike={id:(current.strike?.id??0)+1,at:Date.now(),distance};}
export function clearWeatherAudio(viewer:object){cues.delete(viewer);}
export function readWeatherAudio(viewer:object){return cues.get(viewer);}
export function thunderProfile(distance:number){const metres=Math.max(0,Number.isFinite(distance)?distance:10000);return {delay:Math.min(60,metres/343),gain:.28/(1+metres/5000),cutoff:Math.max(180,1000/(1+metres/3500))};}
/** Original filtered noise: cabin-muted rain and delayed, layered thunder. */
export function createWeatherSound(){
 let context:AudioContext|null=null,master:GainNode|null=null,rainGain:GainNode|null=null,rainSource:AudioBufferSourceNode|null=null,buffer:AudioBuffer|null=null;
 let playing=false,disposed=false,rain=0,storm=false;const rumbles=new Set<AudioBufferSourceNode>();
 const stopMix=onAudioMix(()=>{if(context&&master&&context.state!=='closed')master.gain.setTargetAtTime(.45*readAmbienceMix().weather,context.currentTime,.3);});
 const stopThunder=()=>{for(const source of rumbles){try{source.stop();}catch{}source.disconnect();}rumbles.clear();};
 function initialize(){
  context=new AudioContext();master=context.createGain();master.gain.value=.45*readAmbienceMix().weather;master.connect(context.destination);
  buffer=context.createBuffer(1,context.sampleRate*10,context.sampleRate);const samples=buffer.getChannelData(0);let seed=73419;
  for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
  rainSource=context.createBufferSource();rainSource.buffer=buffer;rainSource.loop=true;
  const low=context.createBiquadFilter(),high=context.createBiquadFilter();low.type='lowpass';low.frequency.value=1800;high.type='highpass';high.frequency.value=250;
  rainGain=context.createGain();rainGain.gain.value=rain*.09;rainSource.connect(low).connect(high).connect(rainGain).connect(master);rainSource.start();
 }
 return {
  update(rainAmount:number,stormActive:boolean){rain=Math.max(0,Math.min(1,Number.isFinite(rainAmount)?rainAmount:0));storm=stormActive;if(!storm)stopThunder();if(context&&rainGain){rainGain.gain.cancelScheduledValues(context.currentTime);rainGain.gain.setTargetAtTime(rain*.09,context.currentTime,.8);}},
  thunder(distance:number){if(!playing||!storm||!context||context.state!=='running'||!buffer||!master||rumbles.size>=4)return;const profile=thunderProfile(distance),start=context.currentTime+profile.delay;
   const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=profile.cutoff;
   gain.gain.value=0;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(profile.gain,start+.22);gain.gain.exponentialRampToValueAtTime(profile.gain*.4,start+1.2);gain.gain.linearRampToValueAtTime(profile.gain*.65,start+2.1);gain.gain.exponentialRampToValueAtTime(.0001,start+7);
   source.connect(filter).connect(gain).connect(master);rumbles.add(source);source.onended=()=>{rumbles.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};source.start(start);source.stop(start+7.2);
  },
  async start(){if(disposed)return;playing=true;if(!context)initialize();await context!.resume();if(!playing||disposed){if(context?.state!=='closed')void context?.suspend();}},
  pause(){playing=false;stopThunder();if(context&&context.state!=='closed')void context.suspend();},
  dispose(){disposed=true;stopMix();playing=false;stopThunder();rainSource?.stop();rainSource?.disconnect();if(context&&context.state!=='closed')void context.close();context=null;}
 };
}
