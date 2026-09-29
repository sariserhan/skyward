import type {FlightState,AircraftType} from './flightSimulator';
/** Synthesized sound only: no audio downloads, paid services or microphone. */
export class SimulatorAudio {
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private engine:OscillatorNode|null=null;
 private engineGain:GainNode|null=null;
 private wind:GainNode|null=null;
 private rumble:GainNode|null=null;
 private gear:GainNode|null=null;
 private alarm:GainNode|null=null;
 private nodes:AudioNode[]=[];
 private speech:SpeechSynthesisUtterance|null=null;
 private disposed=false;
 private previousGround:boolean|null=null;
 private impactSource:AudioBufferSourceNode|null=null;
 async start(){
  if(this.disposed)return;
  if(!this.context){
   const c=new AudioContext();this.context=c;const master=c.createGain();master.gain.value=0;master.connect(c.destination);this.master=master;
   const tone=(hz:number,wave:OscillatorType)=>{const o=c.createOscillator(),g=c.createGain();o.type=wave;o.frequency.value=hz;g.gain.value=0;o.connect(g);g.connect(master);o.start();this.nodes.push(o,g);return {o,g};};
   const engine=tone(60,'triangle');this.engine=engine.o;this.engineGain=engine.g;
   this.gear=tone(160,'sine').g;this.alarm=tone(700,'sine').g;
   const buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
   for(const kind of ['wind','rumble'] as const){const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=buffer;src.loop=true;filter.type='lowpass';filter.frequency.value=kind==='wind'?1400:110;gain.gain.value=0;src.connect(filter);filter.connect(gain);gain.connect(master);src.start();this.nodes.push(src,filter,gain);this[kind]=gain;}
  }
  await this.context.resume();
 }
 update(s:FlightState,type:AircraftType,volume:number,muted:boolean){if(this.previousGround===false&&s.ground&&s.gearPosition>.8&&s.speed>35&&!muted&&s.phase!=='crashed')this.impact(volume,false);this.previousGround=s.ground;const c=this.context;if(!c||!this.master)return;const at=c.currentTime;this.master.gain.setTargetAtTime(muted?0:volume*.22,at,.08);this.engine?.frequency.setTargetAtTime((type==='C172'?35:65)+s.enginePower*(type==='C172'?85:155),at,.15);this.engineGain?.gain.setTargetAtTime((s.fuelExhausted||s.engineRunning===false)?s.enginePower*.35:.08+s.enginePower*.35,at,.15);this.wind?.gain.setTargetAtTime(Math.min(.35,s.speed/800),at,.1);this.rumble?.gain.setTargetAtTime(s.ground?Math.min(.6,s.speed/150):0,at,.12);this.gear?.gain.setTargetAtTime(Math.abs(Number(s.gear)-s.gearPosition)>.01?.08:0,at,.08);this.alarm?.gain.setTargetAtTime(s.warning.includes('STALL')?.17:0,at,.04);}
 impact(volume:number,fatal:boolean){
  const c=this.context;if(!c||c.state!=='running')return;
  const duration=fatal?1.6:.5,buffer=c.createBuffer(1,Math.floor(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=fatal?450:180;gain.gain.value=volume*.2;source.connect(filter);filter.connect(gain);gain.connect(c.destination);this.nodes.push(source,filter,gain);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.nodes=this.nodes.filter(n=>n!==source&&n!==filter&&n!==gain);};this.impactSource=source;source.start();
 }
 say(text:string,volume:number){
  if(this.disposed||!('speechSynthesis' in window)||this.context?.state!=='running')return false;
  // Local voices avoid sending simulator text to an external speech service.
  const voices=window.speechSynthesis.getVoices(),voice=voices.find(v=>v.localService&&v.lang.startsWith('en'));if(!voice)return false;
  if(this.speech&&window.speechSynthesis.speaking&&!/engines out|engine failure|stall|go around/i.test(text))return true;
  try{this.cancelSpeech();const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.rate=1.04;utterance.volume=volume;this.speech=utterance;utterance.onend=utterance.onerror=()=>{if(this.speech===utterance)this.speech=null;};window.speechSynthesis.speak(utterance);return true;}catch{this.speech=null;return false;}
 }
 cancelSpeech(){if(this.speech&&'speechSynthesis' in window){window.speechSynthesis.cancel();this.speech=null;}}
 suspend(){try{this.impactSource?.stop();}catch{}this.impactSource=null;this.cancelSpeech();if(this.context?.state==='running')void this.context.suspend();}
 dispose(){this.disposed=true;this.cancelSpeech();for(const n of this.nodes){try{if(n instanceof AudioScheduledSourceNode)n.stop();n.disconnect();}catch{}}this.nodes=[];if(this.context)void this.context.close();this.context=null;}
}
