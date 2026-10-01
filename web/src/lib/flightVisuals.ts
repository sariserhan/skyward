export const flightZoomLimits={min:.55,max:2.4};
/** Normalize wheel/trackpad units, bound each gesture, and keep a safe model clearance. */
export function flightWheelDistance(distance:number,delta:number,mode=0,height=800){
 if(!Number.isFinite(delta)||!Number.isFinite(distance))return 1.15;
 const pixels=delta*(mode===1?16:mode===2?height:1);
 return Math.max(flightZoomLimits.min,Math.min(flightZoomLimits.max,distance*Math.exp(Math.max(-250,Math.min(250,pixels))*.0015)));
}
/** Presentation-only helpers: never infer a measured gear state or receiver coverage. */
export function smoothstep(from:number,to:number,value:number){const t=Math.max(0,Math.min(1,(value-from)/(to-from)));return t*t*(3-2*t);}
export function illustrativeGear(kind:'takeoff'|'landing',progress:number){return kind==='takeoff'?1-smoothstep(.60,.78,progress):smoothstep(.08,.28,progress);}
export function wheelAngle(seconds:number,speedKnots:number,radius:number){return (seconds*Math.max(0,speedKnots)*.514444/Math.max(.1,radius))%(Math.PI*2);}
export function angleStep(current:number,target:number,amount:number){return current+(((target-current+540)%360)-180)*amount;}
export function flightFraming(width:number,height:number,panel:{left:number;top:number;right:number;bottom:number}|null,length:number,detail:number,fov:number){
 const mobile=width<760;
 const left=mobile?18:Math.max(24,(panel?.right??0)+22),right=Math.max(left+80,width-(mobile?18:84));
 const top=Math.min(115,height*.22),bottom=mobile?Math.max(top+80,(panel?.top??height)-20):height-60;
 const usableWidth=Math.max(80,right-left),usableHeight=Math.max(80,bottom-top),aspect=width/height;
 const vfov=aspect>1?2*Math.atan(Math.tan(fov/2)/aspect):fov;
 // Reserve enough space for the complete airframe, including a generous fin/wings margin.
 const fraction=Math.min(usableWidth/width,usableHeight/height);
 const fit=length*.72/(Math.tan(vfov/2)*Math.max(.12,fraction));
 return {range:Math.max(length*1.8,fit)*detail,cx:(left+right)/2,cy:(top+bottom)/2,vfov};
}
export function coverageSummary(rows:{observedAt:number|null}[],now:number){
 let fresh=0,aging=0,gap=0,unknown=0,newest:number|null=null;
 for(const row of rows){const t=row.observedAt;if(t===null||!Number.isFinite(t)){unknown++;continue;}newest=Math.max(newest??t,t);const age=Math.max(0,now-t);if(age<=30000)fresh++;else if(age<=120000)aging++;else gap++;}
 return {fresh,aging,gap,unknown,newest};
}
