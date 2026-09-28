import {Body,Illumination,MoonPhase,GeoVector,RotateVector,Rotation_EQJ_EQD,SiderealTime} from 'astronomy-engine';
export const SKY_BODIES=[
 {name:'Sun',body:Body.Sun,color:'#ffcb64',size:46},
 {name:'Moon',body:Body.Moon,color:'#d5dce5',size:32},
 {name:'Mercury',body:Body.Mercury,color:'#bcb0a2',size:13},
 {name:'Venus',body:Body.Venus,color:'#ecd7ad',size:19},
 {name:'Mars',body:Body.Mars,color:'#d88a66',size:17},
 {name:'Jupiter',body:Body.Jupiter,color:'#dab899',size:28},
 {name:'Saturn',body:Body.Saturn,color:'#d8c39a',size:36},
 {name:'Uranus',body:Body.Uranus,color:'#9bd7d9',size:19},
 {name:'Neptune',body:Body.Neptune,color:'#7599e8',size:19},
] as const;
export type SkyName=typeof SKY_BODIES[number]['name'];
export function skyPositions(date:Date) {
 if(!Number.isFinite(date.getTime()))return [];
 const rotation=Rotation_EQJ_EQD(date),theta=SiderealTime(date)*Math.PI/12,c=Math.cos(theta),s=Math.sin(theta);
 return SKY_BODIES.map(body=>{
  const vec=RotateVector(rotation,GeoVector(body.body,date,true)),distanceAu=Math.hypot(vec.x,vec.y,vec.z);
  return {...body,distanceAu,direction:{x:(c*vec.x+s*vec.y)/distanceAu,y:(-s*vec.x+c*vec.y)/distanceAu,z:vec.z/distanceAu}};
 });
}
export function moonState(date:Date){
 const angle=MoonPhase(date),fraction=Illumination(Body.Moon,date).phase_fraction;
 const name=fraction<.001?'New Moon':fraction>.999?'Full Moon':Math.abs(angle-90)<2?'First quarter':Math.abs(angle-270)<2?'Last quarter':angle<90?'Waxing crescent':angle<180?'Waxing gibbous':angle<270?'Waning gibbous':'Waning crescent';
 return {angle,fraction,name};
}
export function moonLitPath(fraction:number){
 const k=1-2*Math.max(0,Math.min(1,fraction));
 return `M32 12 A20 20 0 0 1 32 52 A${Math.max(.001,Math.abs(20*k))} 20 0 0 ${k>=0?0:1} 32 12Z`;
}
export function planetIcon(name:SkyName,color:string,moon?:ReturnType<typeof moonState>) {
 const rings=name==='Saturn'?`<ellipse cx="32" cy="32" rx="29" ry="9" fill="none" stroke="${color}" stroke-width="5" transform="rotate(-25 32 32)"/>`:'';
 const bands=name==='Jupiter'?'<path d="M12 24h40M10 34h44M14 43h36" stroke="#9b7459" stroke-width="4" opacity=".6" clip-path="url(#disk)"/>':'';
 const craters=name==='Moon'?'<g fill="#737f8c" opacity=".55"><circle cx="24" cy="24" r="5"/><circle cx="38" cy="38" r="6"/><circle cx="23" cy="41" r="3"/></g>':'';
 const glow=name==='Sun'?'<circle cx="32" cy="32" r="30" fill="#ffcb64" opacity=".12"/><circle cx="32" cy="32" r="25" fill="#ffcb64" opacity=".2"/>':'';
 const phase=moon&&name==='Moon'?`<circle cx="32" cy="32" r="20" fill="#18212c"/><g transform="${moon.angle>180?'translate(64 0) scale(-1 1)':''}"><path d="${moonLitPath(moon.fraction)}" fill="${color}"/></g>${craters}`:null;
 return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="light" cx="30%" cy="28%"><stop stop-color="#fff5dc"/><stop offset=".4" stop-color="${color}"/><stop offset="1" stop-color="${name==='Sun'?'#ec951e':'#293747'}"/></radialGradient><clipPath id="disk"><circle cx="32" cy="32" r="20"/></clipPath></defs>${glow}${rings}<circle cx="32" cy="32" r="20" fill="url(#light)"/>${bands}${phase??craters}</svg>`);
}
