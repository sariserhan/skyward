export interface SimWeather {wind:number;direction:number;gusts:number;turbulence:number;rain:number;visibility:number;}
export const CLEAR_WEATHER:SimWeather={wind:0,direction:270,gusts:0,turbulence:0,rain:0,visibility:40};
export function weatherAt(w:SimWeather|undefined,seconds:number,fallbackDirection:number,fallbackWind=0){
 const speed=w?Math.max(0,w.wind+w.gusts*(.5+.5*Math.sin(seconds*.37))):fallbackWind;
 return {speed,direction:w?(w.direction+180)%360:fallbackDirection,turbulence:w?.turbulence??0,rain:w?.rain??0};
}
