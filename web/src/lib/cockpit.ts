import type {Aircraft} from '../types.ts';
export interface PracticeControls {roll:number;pitch:number;rudder:number;throttle:number;gear:boolean;flaps:number;level:boolean;paused:boolean;}
export interface PracticePose {lat:number;lon:number;altitude:number;heading:number;speed:number;pitch:number;bank:number;verticalRate:number;}
export const cockpitControls:PracticeControls={roll:0,pitch:0,rudder:0,throttle:.6,gear:false,flaps:0,level:false,paused:false};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const value=(v:number|null|undefined,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
export function practicePose(a:Aircraft):PracticePose{return {lat:value(a.lat,0),lon:value(a.lon,0),altitude:Math.max(0,value(a.altitude,0)),heading:(value(a.heading,0)+360)%360,speed:Math.max(0,value(a.groundSpeed,0)),pitch:0,bank:0,verticalRate:0};}
/** A deliberately simple local camera-flight model; not an aircraft flight-dynamics model. */
export function stepPractice(p:PracticePose,c:PracticeControls,seconds:number,floorFeet=0):PracticePose{
 if(c.paused)return {...p};const dt=clamp(value(seconds,0),0,.1),blend=1-Math.exp(-dt*3);
 const bank=p.bank+((c.level?0:clamp(c.roll,-1,1)*35)-p.bank)*blend,pitch=p.pitch+((c.level?0:clamp(c.pitch,-1,1)*15)-p.pitch)*blend;
 const target=Math.max(0,clamp(c.throttle,0,1)*520-(c.gear?35:0)-clamp(c.flaps,0,1)*70),speed=Math.max(0,p.speed+clamp(target-p.speed,-16*dt,12*dt));
 const heading=(p.heading+(bank*.075+clamp(c.rudder,-1,1)*3)*dt+360)%360,verticalRate=speed>40?Math.sin(pitch*Math.PI/180)*speed*.514444/.3048*60:0;
 const altitude=Math.max(floorFeet+8,p.altitude+verticalRate*dt/60),distance=speed*.514444*dt/6371000,lat=p.lat*Math.PI/180,lon=p.lon*Math.PI/180,yaw=heading*Math.PI/180;
 const nextLat=Math.asin(clamp(Math.sin(lat)*Math.cos(distance)+Math.cos(lat)*Math.sin(distance)*Math.cos(yaw),-1,1)),nextLon=lon+Math.atan2(Math.sin(yaw)*Math.sin(distance)*Math.cos(lat),Math.cos(distance)-Math.sin(lat)*Math.sin(nextLat));
 return {lat:nextLat*180/Math.PI,lon:((nextLon*180/Math.PI+540)%360)-180,altitude,heading,speed,pitch,bank,verticalRate:altitude<=floorFeet+8&&verticalRate<0?0:verticalRate};
}
