import type {TrailPoint} from '../types.ts';
import {distanceNm} from './experience.ts';
export interface CountryShape {name:string;code:string;polygons:number[][][][];}
export interface ZoneReference {country:string;zone:string;lat:number;lon:number;}
function inRing(lon:number,lat:number,ring:number[][]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function countryAt(shapes:CountryShape[],lon:number,lat:number){return shapes.find(c=>c.polygons.some(poly=>poly[0]&&inRing(lon,lat,poly[0])&&!poly.slice(1).some(hole=>inRing(lon,lat,hole))))??null;}
export function localZone(zones:ZoneReference[],lon:number,lat:number,country?:string){const within=country?zones.filter(z=>z.country===country):[];return (within.length?within:zones).reduce<ZoneReference|null>((best,z)=>!best||distanceNm(lat,lon,z.lat,z.lon)<distanceNm(lat,lon,best.lat,best.lon)?z:best,null);}
export function observedDistance(points:TrailPoint[]){let km=0,gaps=0;for(let i=1;i<points.length;i++){const delta=points[i].time-points[i-1].time;if(delta<=0||delta>120000){gaps++;continue;}km+=distanceNm(points[i-1].lat,points[i-1].lon,points[i].lat,points[i].lon)*1.852;}return {km,gaps};}
