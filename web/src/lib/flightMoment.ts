import type {Aircraft,TrailPoint} from '../types.ts';
import {parseRecording,type Recording} from './sessionRecording.ts';
import type {SharedCamera} from './sharedCamera.ts';
export function flightMoment(a:Aircraft,points:TrailPoint[],now:number,seconds:number,camera:SharedCamera|null):Recording{
 const retained=points.filter(p=>p.time<=now&&p.time>=now-Math.min(300,Math.max(30,seconds))*1000);
 if(retained.length<2)throw Error('Wait for at least two received positions in this time window.');
 return parseRecording({format:'skyward-session',version:1,name:`${a.callsign||a.hex} · flight moment`,source:'ADSB.lol received observations; animation excluded',license:'ODbL-1.0',createdAt:now,tracks:[{identity:{...a},points:retained.map(p=>({...p}))}],camera:camera??undefined});
}
