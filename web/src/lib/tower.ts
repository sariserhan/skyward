import type {Runway} from '../types';
import {bearing} from './flightPresentation.ts';
export function towerPose(r:Runway,side=1){
 const dl=((r.b[0]-r.a[0]+540)%360)-180;
 const lon=((r.a[0]+dl*.5+540)%360)-180,lat=(r.a[1]+r.b[1])*.5;
 const angle=(bearing({lon:r.a[0],lat:r.a[1]},{lon:r.b[0],lat:r.b[1]})+side*90)*Math.PI/180;
 const p={lat:Math.max(-89.99,Math.min(89.99,lat+Math.cos(angle)*.0045)),lon:((lon+Math.sin(angle)*.0045/Math.max(.05,Math.cos(lat*Math.PI/180))+540)%360)-180};
 return {...p,heading:bearing(p,{lon,lat}),height:65};
}
