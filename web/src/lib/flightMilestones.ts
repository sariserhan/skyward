import {contiguous} from './positionQuality.ts';
import type {TrailPoint} from '../types';
export interface FlightMilestone {time:number;label:string;}
export function flightMilestones(points:TrailPoint[]):FlightMilestone[]{
 if(!points.length)return [];
 const result:FlightMilestone[]=[{time:points[0].time,label:'First session observation'}];
 let previousPhase='',candidate='',count=0;
 for(let i=0;i<points.length;i++){
  const p=points[i],before=points[i-1];
  if(before&&!contiguous(before,p)){result.push({time:p.time,label:'Observations resumed after a gap'});previousPhase='';candidate='';count=0;}
  if(p.ground){if(previousPhase!=='ground')result.push({time:p.time,label:'Reported on ground'});previousPhase='ground';candidate='';count=0;continue;}
  if(!before||before.ground||!contiguous(before,p))continue;
  const rate=(p.altitude-before.altitude)*60000/(p.time-before.time);
  const phase=rate>400?'Climb observed':rate< -400?'Descent observed':Math.abs(rate)<200&&p.altitude>=18000?'Level at altitude · cruise inferred':'';
  if(phase&&phase===candidate)count++;else{candidate=phase;count=phase?1:0;}
  if(count>=2&&phase!==previousPhase){result.push({time:p.time,label:phase});previousPhase=phase;}
 }
 return result.length>40?[result[0],...result.slice(-39)]:result;
}
