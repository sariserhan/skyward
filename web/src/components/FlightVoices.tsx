import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import {FlightDialogue,TurbulenceRecovery,turbulenceRecoveryAnnouncement,TurbulenceAnnouncement,turbulenceAnnouncement,captainAnnouncement,towerExchange,type DialogueContext,type DialogueLine} from '../lib/flightDialogue';
import {readAudioMix,onAudioMix,acquireSpeechFocus} from '../lib/audioMix';
import {readPublishedWeather,weatherRoughness} from '../lib/weatherMotion';
import {reportDistanceKm} from '../lib/localWeather';
import {sharedLiveMotion} from '../lib/liveMotion';
function preference(){try{const p=JSON.parse(localStorage.getItem('skyward.flight-voices.v1')??'{}');return {radio:p.radio===true,captain:p.captain===true};}catch{return {radio:false,captain:false};}}
type Props={identity:string;context:DialogueContext;viewer?:object|null;lat?:number|null;lon?:number|null;suspended:boolean;captainOnly?:boolean;cockpit?:boolean;ground?:boolean};
/** Local synthesized roleplay, never live ATC or an operational clearance. */
export function FlightVoices(p:Props){
 const [voiceId,setVoiceId]=useState(()=>{try{return localStorage.getItem('skyward.voice.v1')??'';}catch{return '';}}),[availableVoices,setAvailableVoices]=useState<SpeechSynthesisVoice[]>([]);
 useEffect(()=>{if(!('speechSynthesis' in window))return;const update=()=>setAvailableVoices(window.speechSynthesis.getVoices().filter(v=>v.localService&&/^en(?:[-_]|$)/i.test(v.lang)));update();window.speechSynthesis.addEventListener('voiceschanged',update);return()=>window.speechSynthesis.removeEventListener('voiceschanged',update);},[]);
 useEffect(()=>{try{localStorage.setItem('skyward.voice.v1',voiceId);}catch{}},[voiceId]);
 const [enabled,setEnabled]=useState(preference),[unlocked,setUnlocked]=useState(false),[caption,setCaption]=useState(''),[notice,setNotice]=useState('');
 const [expanded,setExpanded]=useState(false),[history,setHistory]=useState<string[]>([]);
 const recordCaption=(text:string)=>{setCaption(text);setHistory(rows=>[...rows.slice(-7),text]);};
 const [host,setHost]=useState<Element|null>(null);useEffect(()=>{setHost(p.cockpit?document.querySelector('.cockpit-mode'):null);},[p.cockpit]);
 const latest=useRef({p,enabled,unlocked,voiceId});latest.current={p,enabled,unlocked,voiceId};
 const repeat=useRef<((channel?:'captain'|'radio',test?:boolean)=>void)|null>(null);
 const activate=(channel:'captain'|'radio',toggle=false,test=false)=>{const next={...latest.current.enabled,[channel]:toggle?!latest.current.enabled[channel]:true};latest.current={...latest.current,enabled:next,unlocked:true};setEnabled(next);setUnlocked(true);if(next[channel]){if('speechSynthesis' in window)window.speechSynthesis.resume();repeat.current?.(channel,test);}};
 useEffect(()=>{try{localStorage.setItem('skyward.flight-voices.v1',JSON.stringify(enabled));}catch{}},[enabled]);
 useEffect(()=>{
  setCaption('');setHistory([]);setNotice('');
  const planner=new FlightDialogue(),turbulence=new TurbulenceAnnouncement(),recovery=new TurbulenceRecovery();let releaseSpeech:(()=>void)|null=null;let queue:DialogueLine[]=[],owned:SpeechSynthesisUtterance|null=null,disposed=false,lastPhase='',stableAt=Date.now(),lastSpoken=0;
  const stop=()=>{queue=[];releaseSpeech?.();releaseSpeech=null;if(owned&&'speechSynthesis' in window){owned=null;window.speechSynthesis.cancel();}};
  const context=()=>{const {p}=latest.current,frame=sharedLiveMotion.displayed(p.identity);const c={...p.context};if(frame){c.phase=frame.landingPhase??(frame.ground?'ground':(frame.verticalRate??0)>300?'climb':'airborne');c.altitude=frame.altitude;}
   const report=p.viewer?readPublishedWeather(p.viewer):undefined,lat=frame?.lat??p.lat,lon=frame?.lon??p.lon;
   if(report&&lat!=null&&lon!=null&&Date.now()-report.observedAt>=0&&Date.now()-report.observedAt<90*60000&&reportDistanceKm(report,{lat,lon})<100)c.weather=report.storm?'Nearby station reports mention thunderstorms. Please keep your seat belt fastened.':report.snow?'Nearby stations report snow.':report.rain?'Nearby stations report rain.':report.clouds.length?'Nearby stations report cloud cover.':undefined;
   return c;
  };
  const pump=()=>{const {p,enabled,unlocked,voiceId}=latest.current;
   if(document.hidden||p.suspended||!unlocked){stop();recovery.update(0,Date.now(),true,false);return;}
   // Other cockpit callouts can cancel browser speech without dispatching onend.
   if(owned&&(Date.now()-lastSpoken>45000||(Date.now()-lastSpoken>1500&&'speechSynthesis' in window&&!window.speechSynthesis.speaking&&!window.speechSynthesis.pending))){owned=null;releaseSpeech?.();releaseSpeech=null;setNotice('Speech was interrupted or did not start. Press Captain update to retry.');}
   if(owned&&!enabled[(owned as SpeechSynthesisUtterance&{channel:'radio'|'captain'}).channel])stop();
   queue=queue.filter(line=>enabled[line.channel]);
   const c=context(),now=Date.now(),frame=sharedLiveMotion.displayed(p.identity),report=p.viewer?readPublishedWeather(p.viewer):undefined,lat=frame?.lat??p.lat,lon=frame?.lon??p.lon,ground=frame?.ground??p.ground??['ready','ground','parked','taxi','rollout'].includes(c.phase);
   const rough=lat!=null&&lon!=null&&c.altitude!=null?weatherRoughness(report,lat,lon,c.altitude*.3048,ground):0;
   const weatherValid=Number.isFinite(c.altitude)&&!!report&&lat!=null&&lon!=null&&now-report.observedAt>=0&&now-report.observedAt<90*60000&&reportDistanceKm(report,{lat,lon})<100;
   const onset=enabled.captain&&weatherValid&&turbulence.update(rough,now,ground);
   const recovered=recovery.update(rough,now,ground||!enabled.captain,weatherValid,onset);
   if(recovered&&enabled.captain)queue.push({channel:'captain',speaker:'Captain',text:turbulenceRecoveryAnnouncement});
   if(onset){stop();lastPhase=c.phase;stableAt=now;lastSpoken=0;queue=[{channel:'captain',speaker:'Captain',text:turbulenceAnnouncement(c.weather)}];}
   if(c.phase!==lastPhase){lastPhase=c.phase;stableAt=now;queue=[];}
   if(now-stableAt>=4000&&!queue.length&&!owned&&now-lastSpoken>12000)queue=planner.next(c,{radio:enabled.radio&&!p.captainOnly,captain:enabled.captain});
   if(owned||!queue.length||now-lastSpoken<1200)return;
   if(!('speechSynthesis' in window)){const line=queue.shift()!;recordCaption(`${line.speaker}: ${line.text}`);setNotice('Speech unavailable in this browser. Transcript only.');lastSpoken=now;return;}
   if(window.speechSynthesis.speaking||window.speechSynthesis.pending)return;
   const playable=Math.max(0,queue.findIndex(line=>readAudioMix()[line.channel==='radio'?'radio':'cabin']>0));
   const line=queue[playable],voices=window.speechSynthesis.getVoices().filter(v=>v.localService&&/^en(?:[-_]|$)/i.test(v.lang));
   if(!voices.length){setCaption(`${line.speaker}: ${line.text}`);setNotice('Waiting for a local English voice. If none is installed, only the transcript is available.');return;}
   const volume=readAudioMix()[line.channel==='radio'?'radio':'cabin'];if(volume===0){setNotice(`${line.channel==='radio'?'Radio':'Cabin'} sound is muted. Raise its level in Sound mix to hear ${line.speaker.toLowerCase()} speech.`);return;}
   queue.splice(playable,1);recordCaption(`${line.speaker}: ${line.text}`);lastSpoken=now;
   const utterance=new SpeechSynthesisUtterance(line.text);Object.assign(utterance,{channel:line.channel});utterance.voice=voices.find(v=>v.voiceURI===voiceId)??voices.find(v=>v.default)??voices[0];utterance.lang=utterance.voice.lang;utterance.rate=line.speaker==='Tower'?1.04:.92;utterance.pitch=line.speaker==='Tower'?1:.9;utterance.volume=volume*.8;owned=utterance;
   const finish=()=>{if(owned===utterance){owned=null;releaseSpeech?.();releaseSpeech=null;}};
   utterance.onstart=()=>{if(owned===utterance){releaseSpeech=acquireSpeechFocus();setNotice(`Speaking · ${line.speaker}`);}};utterance.onend=()=>{const active=owned===utterance;finish();if(active&&!disposed)setNotice('');};utterance.onerror=()=>{const active=owned===utterance;finish();if(active&&!disposed)setNotice('Speech could not play. Press Captain update or toggle Tower dialogue to retry.');};
   try{setNotice(`Starting ${line.speaker.toLowerCase()} speech…`);window.speechSynthesis.speak(utterance);}catch{finish();setNotice('Speech could not play. Transcript available.');}
  };
  repeat.current=(channel='captain',test=false)=>{stop();const c=context();lastPhase=c.phase;stableAt=Date.now();if(latest.current.enabled[channel])queue=channel==='captain'?[{channel:'captain',speaker:'Captain',text:test?'This is your captain. Your flight announcements are ready. Enjoy the view.':captainAnnouncement(c)}]:towerExchange(c);lastSpoken=0;pump();};
  const voicesReady=()=>pump();if('speechSynthesis' in window)window.speechSynthesis.addEventListener('voiceschanged',voicesReady);
  const timer=setInterval(pump,500),mixStop=onAudioMix(()=>{if(owned){const channel=(owned as SpeechSynthesisUtterance&{channel:'radio'|'captain'}).channel;if(readAudioMix()[channel==='radio'?'radio':'cabin']===0)stop();}});
  const hide=()=>{if(document.hidden){stop();recovery.update(0,Date.now(),true,false);}};document.addEventListener('visibilitychange',hide);
  return()=>{disposed=true;if('speechSynthesis' in window)window.speechSynthesis.removeEventListener('voiceschanged',voicesReady);clearInterval(timer);mixStop();document.removeEventListener('visibilitychange',hide);stop();repeat.current=null;};
 },[p.identity]);
 const controls=<details className="flight-voices" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>Flight voices · Simulation</summary><small>Scripted tower, captain and cabin dialogue. Not live radio.</small><div className="flight-buttons">{!p.captainOnly&&<button role="switch" aria-label="Simulated tower dialogue" aria-checked={enabled.radio} onClick={()=>activate('radio',true)}>Tower dialogue: {enabled.radio?'On':'Off'}</button>}<button role="switch" aria-label="Captain announcements" aria-checked={enabled.captain} onClick={()=>activate('captain',true)}>Captain: {enabled.captain?'On':'Off'}</button>{!unlocked&&(enabled.radio||enabled.captain)&&<button onClick={()=>activate(enabled.captain?'captain':'radio')}>Enable voices</button>}<button disabled={p.suspended} onClick={()=>activate('captain')}>Captain update</button><button disabled={p.suspended} onClick={()=>activate('captain',false,true)}>Test voice</button></div><label>Announcement voice<select aria-label="Announcement voice" value={availableVoices.some(v=>v.voiceURI===voiceId)?voiceId:''} onChange={e=>setVoiceId(e.target.value)}><option value="">System default</option>{availableVoices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></label><small>{availableVoices.length?'Local voice ready · press Test voice to listen.':'No local English voice available yet. Captions remain available.'}</small>{caption&&<p aria-live="polite">{caption}</p>}{history.length>1&&<details className="voice-history"><summary>Recent dialogue ({history.length})</summary><ol>{history.map((text,i)=><li key={i}>{text}</li>)}</ol><button onClick={()=>setHistory([])}>Clear dialogue history</button></details>}{notice&&<small role="status">{notice}</small>}<small>Levels follow Radio and Cabin in Sound mix.</small></details>;
 return p.cockpit&&host?createPortal(controls,host):controls;
}
