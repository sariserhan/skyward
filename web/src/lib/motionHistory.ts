import type {Aircraft,TrailPoint} from '../types.ts';
import {appendTrail} from './aircraft.ts';
export const MOTION_DELAY_MS=45000;
// Independent of the smaller archive used by the history/replay UI.
export function retainMotion(history:Map<string,TrailPoint[]>,rows:Aircraft[],selected?:string,limit=4000){
 for(const a of rows){if(a.targetKind!=='aircraft')continue;const previous=history.get(a.hex)??[],next=appendTrail(previous,a);if(next===previous)continue;history.delete(a.hex);history.set(a.hex,next.slice(-32));}
 while(history.size>limit){const key=[...history.keys()].find(k=>k!==selected);if(key===undefined)break;history.delete(key);}
}
export function motionStatus(points:TrailPoint[],now:number,reduced=false){
 if(reduced)return 'Reduced motion · positions update with each received fix';
 if(points.length<2)return 'Waiting for another position fix · no movement inferred';
 const time=now-MOTION_DELAY_MS;
 if(time<points[0].time)return 'Building 45s motion buffer · positions are received observations';
 if(time>=points.at(-1)!.time)return 'Waiting for a new position · held at last received fix';
 for(let i=1;i<points.length;i++)if(time<points[i].time&&time>=points[i-1].time&&points[i].time-points[i-1].time>120000)return 'Signal gap · animation paused';
 return '45s delayed motion · interpolating received positions';
}
