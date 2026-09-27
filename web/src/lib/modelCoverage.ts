import type {Aircraft} from '../types.ts';
import {sourcedModel} from './sourcedModels.ts';
export function modelCoverage(observations:Aircraft[]){
 const unique=new Map<string,Aircraft>();for(const a of observations){if(a.targetKind&&a.targetKind!=='aircraft')continue;const old=unique.get(a.hex);if(!old||(a.observedAt??0)>(old.observedAt??0))unique.set(a.hex,a);}
 const counts=new Map<string,number>();for(const a of unique.values()){const type=a.aircraftType.trim().toUpperCase()||'Unknown';counts.set(type,(counts.get(type)??0)+1);}
 return [...counts].map(([type,count])=>{const model=sourcedModel(type);return {type,count,match:model?.match??'fallback',model:model?.label??'Approximate fallback'};}).sort((a,b)=>Number(a.match==='type')-Number(b.match==='type')||b.count-a.count||a.type.localeCompare(b.type));
}
