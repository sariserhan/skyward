import type {Runway} from '../types.ts';
export type RunwayLamp={lon:number;lat:number;kind:'edge'|'center'|'threshold'|'reil'|'approach'|'crossbar';end:0|1;t:number;sequence:number};
/** Reference: https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_1.html
 * Illustrative instrument-runway layout. Actual installed equipment/state is unavailable. */
export function runwayLighting(r:Runway,spacing=60):RunwayLamp[]{
 if(![...r.a,...r.b,r.width,r.length,spacing].every(Number.isFinite)||r.length<100||r.width<=0||spacing<1)return [];
 const cos=Math.cos((r.a[1]+r.b[1])/2*Math.PI/180),dx=((r.b[0]-r.a[0]+540)%360)-180,dy=r.b[1]-r.a[1],L=Math.hypot(dx*cos,dy);if(!L||Math.abs(cos)<.01)return [];
 const lamps:RunwayLamp[]=[];
 const add=(t:number,side:number,kind:RunwayLamp['kind'],end:0|1=0,sequence=0)=>lamps.push({lon:((r.a[0]+dx*t-dy/L*side/111120/cos+540)%360)-180,lat:r.a[1]+dy*t+dx*cos/L*side/111120,kind,end,t,sequence});
 const count=Math.min(100,Math.ceil(r.length/spacing));
 for(let i=1;i<count;i++){const t=i/count;add(t,-r.width/2,'edge');add(t,r.width/2,'edge');add(t,0,'center',0,i);}
 for(const end of [0,1] as const){
  for(let i=-3;i<=3;i++)add(end,i*r.width/6,'threshold',end);
  for(const side of [-1,1])add(end,side*(r.width/2+12),'reil',end);
  for(let i=0;i<8;i++)add(end+(end?1:-1)*(i+1)*60/r.length,0,'approach',end,7-i);
  for(const side of [-24,-16,-8,8,16,24])add(end+(end?1:-1)*300/r.length,side,'crossbar',end);
 }
 return lamps;
}
export function runwayFlash(kind:RunwayLamp['kind'],sequence:number,seconds:number,reduced=false){
 if(reduced||!Number.isFinite(seconds))return 1;
 const phase=((seconds% .5)+.5)%.5;
 if(kind==='reil')return phase<.08?1:.04;
 if(kind==='approach')return Math.floor(phase/.05)===sequence?1:.13;
 return 1;
}
export function runwayLampColor(lamp:RunwayLamp,length:number,reverse:boolean,outside:boolean){
 if(lamp.kind==='threshold')return outside?'#48ff89':'#ff493f';
 const remaining=(reverse?lamp.t:1-lamp.t)*length;
 if(lamp.kind==='edge')return remaining<Math.min(610,length/2)?'#ffd35b':'#fff2dd';
 if(lamp.kind==='center')return remaining<305?'#ff493f':remaining<915&&lamp.sequence%2?'#ff493f':'#fff2dd';
 return '#fff8ef';
}
