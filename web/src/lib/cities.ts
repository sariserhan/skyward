import {bearing} from './flightPresentation.ts';
export interface City {name:string;country:string;lon:number;lat:number;rank:number;population:number;capital:boolean;}
export function nearestCity(cities:City[],lon:number,lat:number){
 if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
 let best:City|null=null,distance=Infinity;const rad=Math.PI/180;
 for(const c of cities){const v=Math.sin((c.lat-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(c.lat*rad)*Math.sin((c.lon-lon)*rad/2)**2;const km=12742*Math.asin(Math.sqrt(Math.min(1,v)));if(km<distance){distance=km;best=c;}}
 if(!best)return null;const direction=['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing(best,{lon,lat})/45)%8];return {city:best,km:Math.round(distance),direction};
}
