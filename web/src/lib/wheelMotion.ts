/** Presentation-only wheel inertia and damped landing-gear compression. */
export interface WheelMotion {angle:number;omega:number;compression:number;velocity:number;ground:boolean;speed:number;}
export function wheelMotion(old:WheelMotion,speed:number,ground:boolean,radius:number,strut:number,seconds:number,reduced=false):WheelMotion{
 const dt=Math.max(0,Math.min(.1,seconds)),v=Math.max(0,speed)*.514444;
 const omega=old.omega+(ground?v/Math.max(.1,radius)-old.omega:-old.omega)*(1-Math.exp(-dt*(ground?14:1.2)));
 const braking=ground?Math.max(0,(old.speed-speed)*.514444/Math.max(.01,dt)):0;
 const target=ground?strut*(.12+Math.min(.04,braking*.008)):0;
 let velocity=old.velocity,compression=old.compression;
 if(ground&&!old.ground&&!reduced)velocity+=strut*.5;
 const steps=Math.max(1,Math.ceil(dt/.016)),step=dt/steps;
 for(let i=0;i<steps;i++){velocity+=((target-compression)*80-velocity*16)*step;compression=Math.max(0,Math.min(strut*.28,compression+velocity*step));}
 return {angle:reduced?old.angle:(old.angle+omega*dt)%(Math.PI*2),omega,compression:reduced?target:compression,velocity:reduced?0:velocity,ground,speed};
}
