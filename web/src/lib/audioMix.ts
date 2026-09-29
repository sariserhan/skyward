export type AudioMix={engine:number;cabin:number;weather:number;radio:number};
export const defaultAudioMix:AudioMix={engine:1,cabin:1,weather:1,radio:1};
export function normalizeAudioMix(value:unknown):AudioMix{const v=value&&typeof value==='object'?value as Partial<AudioMix>:{};return Object.fromEntries(Object.entries(defaultAudioMix).map(([k,d])=>[k,typeof v[k as keyof AudioMix]==='number'&&Number.isFinite(v[k as keyof AudioMix])?Math.max(0,Math.min(1,v[k as keyof AudioMix]!)):d])) as AudioMix;}
let current:AudioMix|null=null;const listeners=new Set<()=>void>();
export function readAudioMix(){if(!current){try{current=normalizeAudioMix(JSON.parse(localStorage.getItem('skyward.audio-mix.v1')??'null'));}catch{current={...defaultAudioMix};}}return current;}
export function saveAudioMix(value:AudioMix){current=normalizeAudioMix(value);try{localStorage.setItem('skyward.audio-mix.v1',JSON.stringify(current));}catch{}listeners.forEach(fn=>fn());}
export function onAudioMix(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}

/** Temporary speech focus never changes saved preferences or warning/alarm volume. */
const speechOwners=new Set<symbol>();
export function readAmbienceMix():AudioMix{
 const mix=readAudioMix();if(!speechOwners.size)return mix;
 return {...mix,engine:mix.engine*.45,cabin:mix.cabin*.28,weather:mix.weather*.4};
}
export function acquireSpeechFocus(){
 const owner=Symbol('speech');speechOwners.add(owner);listeners.forEach(fn=>fn());
 let timer:ReturnType<typeof setTimeout>;
 const release=()=>{clearTimeout(timer);if(speechOwners.delete(owner))listeners.forEach(fn=>fn());};
 // A missing browser speech callback must never leave ambience permanently quiet.
 timer=setTimeout(release,45000);return release;
}
export const audioPresets:Record<string,AudioMix>={
 Balanced:{engine:1,cabin:1,weather:1,radio:1},
 'Quiet cabin':{engine:.3,cabin:.45,weather:.35,radio:1},
 'Weather immersion':{engine:.5,cabin:.6,weather:1,radio:1},
};
