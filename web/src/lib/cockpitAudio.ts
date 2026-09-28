export interface CockpitAudioInput {speed:number|null;throttle:number|null;volume:number;}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function cockpitAudioSettings(type:string,input:CockpitAudioInput){
 const prop=/^(AT[47]|DH8|DHC|C1[57]|C208|C172|C182|PA[234]|PC12|BE[29]|B350|SR2)/i.test(type);
 const speed=Number.isFinite(input.speed)?clamp(input.speed!,0,600):0;
 const power=input.throttle!==null&&Number.isFinite(input.throttle)?clamp(input.throttle,0,1):clamp(.25+speed/700,.25,.85);
 return {frequency:(prop?38:48)+power*(prop?42:62),hum:prop?.12:.07,wind:350+speed*2,volume:Number.isFinite(input.volume)?clamp(input.volume,0,1)*.18:0};
}
/** Original illustrative engine/ventilation sound. No media or provider requests. */
export function createCockpitSound(type:string){
 let context:AudioContext|null=null,master:GainNode|null=null,low:BiquadFilterNode|null=null,humGain:GainNode|null=null;
 let disposed=false,wantsPlayback=false,input:CockpitAudioInput={speed:null,throttle:null,volume:.3};
 const sources:AudioScheduledSourceNode[]=[],oscillators:OscillatorNode[]=[],nodes:AudioNode[]=[];
 const update=(next:CockpitAudioInput)=>{input=next;if(!context||!master||!low||!humGain||context.state==='closed')return;const settings=cockpitAudioSettings(type,next),t=context.currentTime;master.gain.setTargetAtTime(wantsPlayback?settings.volume:0,t,.15);low.frequency.setTargetAtTime(settings.wind,t,.4);humGain.gain.setTargetAtTime(settings.hum,t,.25);oscillators.forEach((o,i)=>o.frequency.setTargetAtTime(settings.frequency*(i?1.51:1),t,.4));};
 function initialize(){
  const c=new AudioContext();context=c;master=c.createGain();master.gain.value=0;master.connect(c.destination);low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=500;const high=c.createBiquadFilter();high.type='highpass';high.frequency.value=35;
  const buffer=c.createBuffer(1,c.sampleRate*4,c.sampleRate),data=buffer.getChannelData(0);let seed=8173;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
  const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;noise.connect(low).connect(high).connect(master);noise.start();sources.push(noise);
  humGain=c.createGain();humGain.gain.value=.07;humGain.connect(master);for(let i=0;i<2;i++){const o=c.createOscillator();o.type='sine';o.connect(humGain);o.start();oscillators.push(o);sources.push(o);}nodes.push(master,low,high,humGain);update(input);
 }
 return {update,start:async()=>{if(disposed)return;wantsPlayback=true;if(!context)initialize();const c=context!;await c.resume();if(disposed||!wantsPlayback){if(c.state!=='closed')await c.suspend();return;}update(input);},pause:()=>{wantsPlayback=false;if(context&&context.state!=='closed'){master!.gain.value=0;void context.suspend().catch(()=>{});}},dispose:()=>{disposed=true;wantsPlayback=false;for(const source of sources){try{source.stop();}catch{}source.disconnect();}for(const node of nodes)node.disconnect();if(context&&context.state!=='closed')void context.close().catch(()=>{});context=null;}};
}
