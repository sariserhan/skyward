/** Bounded gameplay approximation, not a calibrated aircraft flight model. */
export function advancedAerodynamics(speed:number,pitch:number,bank:number,altitudeFt:number,spanM:number,ground:boolean){
 if(ground)return {gravity:0,inducedDrag:0,bankSink:0,groundEffect:0};
 const rad=Math.PI/180,v=Math.max(0,speed),load=1/Math.max(.5,Math.cos(Math.max(-60,Math.min(60,bank))*rad));
 const h=Math.max(0,altitudeFt)*.3048/Math.max(1,spanM),groundEffect=.7/(1+Math.pow(16*h,2));
 return {gravity:-19.06*Math.sin(Math.max(-25,Math.min(25,pitch))*rad),inducedDrag:(.12+.35*(load*load-1))*(1-groundEffect),bankSink:v*101.269*(1-1/load)*.045,groundEffect};
}
