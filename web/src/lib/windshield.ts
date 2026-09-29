import {altitudeWeather,reportDistanceKm,type WeatherReport} from './localWeather.ts';
export type WiperMode='auto'|'off'|'slow'|'fast';
const weather=new WeakMap<object,WeatherReport>();
export function publishWindshieldWeather(viewer:object,report:WeatherReport|null){if(report)weather.set(viewer,report);else weather.delete(viewer);}
export function windshieldWeather(viewer:object){return weather.get(viewer);}
export function windshieldRain(report:WeatherReport|undefined,lat:number,lon:number,altitude:number,now=Date.now()){
 if(!report||!Number.isFinite(altitude)||now-report.observedAt>7200000||report.observedAt-now>300000||reportDistanceKm(report,{lat,lon})>150)return 0;
 return altitudeWeather(report,altitude).precipitation*Math.max(0,Math.min(1,report.rain));
}
export function wiperAngle(phase:number){return -Math.PI+.15+(1-Math.cos(phase*Math.PI*2))/2*(Math.PI-.3);}
/** Clear the actual swept sector, including frames that skip over a droplet. */
export function wiperClears(x:number,y:number,pivotX:number,pivotY:number,radius:number,previous:number,current:number){
 const dx=x-pivotX,dy=y-pivotY,d=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
 return d>=radius*.58&&d<=radius&&angle>=Math.min(previous,current)-.04&&angle<=Math.max(previous,current)+.04;
}
