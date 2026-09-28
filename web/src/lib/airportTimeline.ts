import type {Aircraft,TrailPoint} from '../types';
export interface AirportEvent {id:string;hex:string;label:string;kind:'arrival'|'departure';time:number;fromTime:number;aircraft:Aircraft;}
const nm=(a:{lat:number;lon:number},b:{lat:number;lon:number})=>{const r=Math.PI/180;return 6880.13*Math.asin(Math.min(1,Math.sqrt(Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2)));};
/** Confirm a state transition with two fixes on either side; never consume predicted positions. */
export function airportTimeline(rows:Aircraft[],histories:Map<string,TrailPoint[]>,airport:{lat:number;lon:number},now:number):AirportEvent[]{
 const events:AirportEvent[]=[];
 for(const aircraft of rows){
  if(aircraft.targetKind!=='aircraft')continue;
  const points=histories.get(aircraft.hex)??[];
  for(let i=2;i<points.length-1;i++){
   const window=points.slice(i-2,i+2),[before,a,b,after]=window;
   if(a.ground===b.ground||before.ground!==a.ground||after.ground!==b.ground)continue;
   if(b.time<now-30*60000||after.time>now+1000)continue;
   if(window.some(p=>![p.time,p.lon,p.lat].every(Number.isFinite)))continue;
   if(window.some((p,j)=>j>0&&(p.breakBefore||p.time<=window[j-1].time||p.time-window[j-1].time>120000||nm(p,window[j-1])/(p.time-window[j-1].time)*3600000>700)))continue;
   if(window.some(p=>nm(p,airport)>(p.ground?3:8)))continue;
   events.push({id:`${aircraft.hex}-${b.time}`,hex:aircraft.hex,label:aircraft.callsign||aircraft.registration||aircraft.hex,kind:b.ground?'arrival':'departure',time:b.time,fromTime:a.time,aircraft});
  }
 }
 return events.sort((a,b)=>b.time-a.time).slice(0,50);
}

/** Latest ground observations, separate from inferred arrival/departure transitions. */
export function airportGroundActivity(rows:Aircraft[],airport:{lat:number;lon:number},now:number){
 return rows.filter(a=>a.targetKind==='aircraft'&&a.ground&&a.lat!==null&&a.lon!==null&&a.observedAt!==null&&now-a.observedAt<=120000&&a.observedAt<=now+1000&&nm({lat:a.lat,lon:a.lon},airport)<=3).sort((a,b)=>b.observedAt!-a.observedAt!).slice(0,30);
}
