export type TravelMoment={kind:string;label:string;source:'observed'|'reported'|'simulated';time:number};
export function mergeTravelMoments(old:TravelMoment[],incoming:TravelMoment[]){
 const valid=(m:TravelMoment)=>m&&typeof m.kind==='string'&&typeof m.label==='string'&&Number.isFinite(m.time)&&['observed','reported','simulated'].includes(m.source);
 const result=old.filter(valid);for(const item of incoming.filter(valid))if(!result.some(m=>m.kind===item.kind&&m.time===item.time))result.push({...item,label:item.label.slice(0,140)});
 return result.sort((a,b)=>a.time-b.time).slice(-24);
}
export function readTravelRecap(id:string):TravelMoment[]{try{return mergeTravelMoments([],JSON.parse(sessionStorage.getItem('skyward.recap.'+id)||'[]'));}catch{return [];}}
export function saveTravelRecap(id:string,rows:TravelMoment[]){try{sessionStorage.setItem('skyward.recap.'+id,JSON.stringify(rows.slice(-24)));}catch{}}
export function hiddenTravelers():string[]{try{const v=JSON.parse(localStorage.getItem('skyward.hidden-travelers.v1')||'[]');return Array.isArray(v)?v.filter(id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)).slice(-100):[];}catch{return [];}}
