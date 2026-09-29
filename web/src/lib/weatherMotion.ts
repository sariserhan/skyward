import {cloudThickness,reportDistanceKm,type WeatherReport} from './localWeather.ts';

// Presentation only: surface weather cannot measure turbulence along a flight track.
const reports=new WeakMap<object,WeatherReport>();
export function publishWeather(viewer:object,report:WeatherReport|null){if(report)reports.set(viewer,report);else reports.delete(viewer);}
export function weatherRoughness(report:WeatherReport|null|undefined,lat:number,lon:number,altitudeM:number,ground:boolean,now=Date.now()){
 if(!report||ground||now-report.observedAt>7200000||report.observedAt-now>300000||reportDistanceKm(report,{lat,lon})>150)return 0;
 const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
 const terrain=report.elevationM??0,clearance=smooth((altitudeM-terrain-20)/120);
 const gust=Math.max(0,(report.gustKnots??0)-(report.windKnots??0))/30;
 const layer=Math.max(0,...report.clouds.map(c=>smooth((altitudeM-c.baseM+250)/500)*smooth((c.baseM+cloudThickness(report)+250-altitudeM)/500)));
 return Math.min(1,(layer*(report.storm?.85:report.rain||report.snow?.35:.08)+gust*smooth((terrain+2500-altitudeM)/1200)))*clearance;
}
export function turbulenceFrame(time:number,strength:number){
 const s=Math.max(0,Math.min(1,strength)),gust=.65+.35*(.5+.5*Math.sin(time*.43+Math.sin(time*.17))),power=s*(.45+2.75*s*s)*gust;
 return {roll:power*(Math.sin(time*2.3+Math.sin(time*.71)) *2.4+Math.sin(time*5.7+.8)*.8),pitch:power*(Math.sin(time*3.1+.4)*1.1+Math.sin(time*7.3)*.3),heave:power*(Math.sin(time*2.7)*.8+Math.sin(time*5.1)*.2)};
}
export function createWeatherMotion(){let amount=0,last:number|undefined;return (viewer:object,lat:number,lon:number,altitudeM:number,ground:boolean,reduced:boolean,time:number)=>{
 const dt=last===undefined?0:Math.max(0,Math.min(.1,time-last));last=time;
 const target=reduced?0:weatherRoughness(reports.get(viewer),lat,lon,altitudeM,ground);
 amount=ground||reduced?0:amount+(target-amount)*(1-Math.exp(-dt*1.4));
 return {...turbulenceFrame(time,amount),strength:amount};
};}
