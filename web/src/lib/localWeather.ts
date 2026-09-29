import {cloudFormation,formationThickness} from './cloudFormation.ts';
export interface WeatherReport {station:string;lat:number;lon:number;observedAt:number;elevationM:number|null;raw:string;distanceKm:number;clouds:{cover:string;baseM:number}[];cloudsKnown:boolean;rain:number;snow:number;hail:boolean;storm:boolean;fog:boolean;visibilityKm:number|null;temperatureC:number|null;windDirection:number|null;windKnots:number|null;gustKnots:number|null;}
export interface LocalWeather {status:'current'|'stale'|'unavailable';fetchedAt:number|null;report:WeatherReport|null;sourceUrl?:string;detail?:string;}
export interface WeatherFocus {lat:number;lon:number;altitudeM:number;datumM?:number;}
export function cloudThickness(report:WeatherReport){return report.storm?5000:report.rain||report.snow?1100:650;}
export function cloudLayerThickness(report:WeatherReport,layer:WeatherReport['clouds'][number]){return formationThickness(cloudFormation(layer,report.storm,!!(report.rain||report.snow)),cloudThickness(report));}
export function altitudeWeather(report:WeatherReport,altitudeM:number){const top=report.clouds.length?Math.max(...report.clouds.map(c=>c.baseM+cloudLayerThickness(report,c))):report.elevationM!==null?report.elevationM+2500:null;
 const inside=report.clouds.some(c=>altitudeM>=c.baseM&&altitudeM<=c.baseM+cloudLayerThickness(report,c));const below=top!==null&&altitudeM<=top;
 return {inside,precipitation:below?1:0,top};}
export function weatherSummary(r:WeatherReport){return [r.storm?'Thunderstorm':null,r.hail?'Hail':null,r.snow?'Snow':null,r.rain?'Rain':null,r.fog?'Mist / fog':null,r.clouds.length?(r.clouds.some(c=>c.cover==='OVC')?'Overcast':r.clouds.some(c=>c.cover==='BKN')?'Mostly cloudy':'Scattered clouds'):r.cloudsKnown?'Clear':null].filter(Boolean).join(' · ')||'Partial weather report';}
export function reportDistanceKm(r:{lat:number;lon:number},f:{lat:number;lon:number}){const rad=Math.PI/180,a=(r.lat-f.lat)*rad,b=(r.lon-f.lon)*rad,h=Math.sin(a/2)**2+Math.cos(r.lat*rad)*Math.cos(f.lat*rad)*Math.sin(b/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,h)));}

/** Visual blend at layer boundaries; not a measurement of visibility inside clouds. */
export function cloudImmersion(report:WeatherReport,altitude:number){
 const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
 return Math.max(0,...report.clouds.map(c=>smooth((altitude-c.baseM)/Math.min(180,cloudLayerThickness(report,c)*.25))*smooth((c.baseM+cloudLayerThickness(report,c)-altitude)/Math.min(180,cloudLayerThickness(report,c)*.25))));
}
