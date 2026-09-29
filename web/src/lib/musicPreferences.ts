export type MusicPreferences={volume:number;loop:boolean;selected:string;favorites:string[]};
export function normalizeMusicPreferences(value:unknown):MusicPreferences{
 const p=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {volume:typeof p.volume==='number'&&Number.isFinite(p.volume)?Math.max(0,Math.min(1,p.volume)):.4,loop:p.loop!==false,selected:typeof p.selected==='string'?p.selected.slice(0,1024):'',favorites:Array.isArray(p.favorites)?[...new Set(p.favorites.filter((v):v is string=>typeof v==='string'&&v.length>0&&v.length<=1024))].slice(0,100):[]};
}
export function readMusicPreferences(){try{return normalizeMusicPreferences(JSON.parse(localStorage.getItem('skyward.music.v1')??'null'));}catch{return normalizeMusicPreferences(null);}}
