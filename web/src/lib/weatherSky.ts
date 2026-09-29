import type * as Cesium from 'cesium';
import {altitudeWeather,type WeatherReport} from './localWeather.ts';
const obscuration=new WeakMap<object,number>();
export const skyObscuration=(viewer:object)=>obscuration.get(viewer)??0;
export function weatherSkyAmount(report:WeatherReport,altitude:number){
 const top=altitudeWeather(report,altitude).top;if(top===null)return 0;
 const below=Math.max(0,Math.min(1,(top+350-altitude)/500));
 const cover=Math.max(0,...report.clouds.map(c=>({FEW:.2,SCT:.5,BKN:.8,OVC:1,VV:1}[c.cover]??0)));
 const amount=report.storm?1:report.rain>=.65?Math.max(.7,cover):report.rain>0?cover*.35:cover*.4;
 return amount*below;
}
export function createWeatherSky(v:Cesium.Viewer){
 const atmosphere=v.scene.skyAtmosphere,box=v.scene.skyBox,sun=v.scene.sun;
 const original={saturation:atmosphere?.saturationShift??0,brightness:atmosphere?.brightnessShift??0,box:box?.show??true,sun:sun?.show??true};let amount=0;
 function apply(){obscuration.set(v,amount);if(atmosphere){atmosphere.saturationShift=original.saturation+( - .95-original.saturation)*amount;atmosphere.brightnessShift=original.brightness-.12*amount;}if(box)box.show=original.box&&amount<.85;if(sun&&!v.entities.getById('celestial-Sun'))sun.show=original.sun&&amount<.75;}
 return {update(target:number,dt:number){amount+=(target-amount)*(1-Math.exp(-Math.max(0,dt)*1.2));apply();},restore(){amount=0;obscuration.delete(v);if(atmosphere){atmosphere.saturationShift=original.saturation;atmosphere.brightnessShift=original.brightness;}if(box)box.show=original.box;if(sun&&!v.entities.getById('celestial-Sun'))sun.show=original.sun;}};
}
