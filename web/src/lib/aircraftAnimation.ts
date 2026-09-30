export interface MotionPose {gear?:number;heading:number;ground:boolean;groundSpeed?:number;turnRate?:number;landingPhase?:string;altitude:number;}
/** Illustrative attitude/configuration; source observations are never modified. */
export class AircraftAnimation {
 private states=new WeakMap<object,{time:number;heading:number;bank:number;ground:boolean;lifted:number}>();
 sample(key:object,frame:MotionPose,now:number,reduced=false){
  const old=this.states.get(key),dt=old?Math.max(0,Math.min(.25,(now-old.time)/1000)):0;
  const turn=frame.turnRate||(old&&dt>0?(((frame.heading-old.heading+540)%360)-180)/Math.max(.001,(now-old.time)/1000):0);
  const bankTarget=frame.ground||reduced?0:Math.max(-25,Math.min(25,Math.atan((frame.groundSpeed??150)*.514444*Math.max(-3,Math.min(3,turn))*Math.PI/180/9.80665)*180/Math.PI));
  const bank=reduced?0:(old?.bank??0)+(bankTarget-(old?.bank??0))*(1-Math.exp(-dt*3));
  const lifted=old?.ground&&!frame.ground?now:old?.lifted??-Infinity;
  const approach=frame.landingPhase==='approach',recentTakeoff=!frame.ground&&now-lifted<8000;
  const gear=frame.gear??(frame.ground||approach||recentTakeoff?1:0),flaps=approach?.7:recentTakeoff?.4:frame.ground&&(frame.groundSpeed??0)>50?.4:0;
  this.states.set(key,{time:now,heading:frame.heading,bank,ground:frame.ground,lifted});return {bank,gear,flaps};
 }
}
export const aircraftAnimation=new AircraftAnimation();
