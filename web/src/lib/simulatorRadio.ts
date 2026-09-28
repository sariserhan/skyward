import {navigationGuidance,FUEL_PROFILES,AIRFRAMES,headingError,runwayHeading,runwayOffset,type FlightState,type FlightPlan} from './flightSimulator.ts';
export interface RadioCall {id:string;time:number;speaker:'Tower'|'Approach'|'Flight deck';text:string;}
export interface RadioState {stage:string;lastReminder:number;calls:RadioCall[];altitude:number;seen:number[];fuel:'normal'|'low'|'empty';assignedHeading:number|null;lastVector:number;vectorLeg:string;offRoute:boolean;recoveredSince:number|null;vectorSerial:number;idleSince:number|null;lastIdleReminder:number;}
export const initialRadio=():RadioState=>({stage:'',lastReminder:-100,altitude:3000,seen:[],calls:[],fuel:'normal',assignedHeading:null,lastVector:-100,vectorLeg:'',offRoute:false,recoveredSince:null,vectorSerial:0,idleSince:null,lastIdleReminder:-100});
/** Deterministic entertainment radio; never uses real ATC frequencies or traffic clearances. */
export function stepRadio(prev:RadioState,s:FlightState,p:FlightPlan,requestHeading=false):RadioState {
 const next={...prev,calls:[...prev.calls],seen:[...prev.seen]},a=AIRFRAMES[p.aircraftType];
 const emit=(speaker:RadioCall['speaker'],id:string,text:string)=>{next.calls=[...next.calls,{speaker,id,time:s.elapsed,text}].slice(-8);};
 const stage=s.ground?s.phase==='landed'?'landed':s.phase==='rollout'?'rollout':s.phase==='crashed'?'crashed':'departure':s.phase==='approach'||s.phase==='landing'?'approach':'airborne';
 if(stage!==prev.stage){next.stage=stage;next.lastReminder=s.elapsed;if(prev.stage===''||prev.stage==='departure')next.lastVector=s.elapsed;
  if(stage==='departure'&&!s.fuelExhausted)emit('Tower','departure',`Skyward one, runway ${p.departure.id.split('/')[0]}, cleared for simulated takeoff. Climb and maintain ${next.altitude} feet above runway datum. Rotate at ${a.rotate} knots.`);
  if(stage==='airborne'&&!s.fuelExhausted)emit('Tower','climb',`Positive climb. Maintain ${next.altitude} feet. Check landing gear and retract flaps as you accelerate.`);
  if(stage==='approach'){emit('Approach','approach',`Skyward one, runway ${p.arrival.id.split('/')[0]}. Follow the extended centreline and glide guidance. Target ${a.approach} knots. Check gear down and landing flaps.`);}
  if(stage==='rollout')emit('Tower','touchdown','Touchdown. Throttle idle, maintain centreline and brake. Stop on the runway in this simulation.');
  if(stage==='landed')emit('Tower','landed','Arrival complete. Parking brake set. Welcome to your destination.');
  if(stage==='crashed')emit('Flight deck','ended','Flight ended. Review your landing configuration and runway alignment.');
 }
 if(!s.fuelExhausted&&stage==='airborne'&&s.elapsed-next.lastReminder>25&&s.altitude>800){
  const difference=s.altitude-next.altitude;
  emit('Tower','altitude-'+Math.floor(s.elapsed),Math.abs(difference)>250?`Skyward one, ${difference>0?'descend':'climb'} to ${next.altitude} feet. ${Math.abs(difference)>600?'Check your assigned altitude.':'Maintain your cleared altitude.'}`:`Skyward one, maintain ${next.altitude} feet. Altitude is good.`);next.lastReminder=s.elapsed;
 }
 if(!s.fuelExhausted&&stage==='approach'&&s.elapsed-next.lastReminder>20){
  const off=runwayOffset(s,p.arrival),unstable=s.altitude<400&&(s.gearPosition<.98||s.speed>a.approach*1.2||Math.abs(off.cross)>p.arrival.width||Math.abs(headingError(s.heading,runwayHeading(p.arrival)))>20||s.verticalSpeed< -900);
  emit('Approach','final-'+Math.floor(s.elapsed),unstable?'Unstable approach. Go around, full power and climb.':`Continue approach runway ${p.arrival.id.split('/')[0]}. Keep the descent stable.`);next.lastReminder=s.elapsed;
 }
 const waiting=stage==='departure'&&s.speed<1&&!s.fuelExhausted&&!s.autopilot;
 next.idleSince=waiting?(prev.idleSince??s.elapsed):null;
 if(next.idleSince!==null&&s.elapsed-next.idleSince>=12&&s.elapsed-prev.lastIdleReminder>=30){
  emit('Tower','runway-idle-'+Math.floor(s.elapsed),`Skyward one, you are still holding on the runway. ${s.brakes?'Release the brakes using the Release brakes button or press B, then smoothly increase throttle.':s.throttle<.5?'Brakes are released. Smoothly increase throttle to begin your takeoff roll.':'Check takeoff power and engine response before continuing.'}`);next.lastIdleReminder=s.elapsed;
 }
 const off=runwayOffset(s,p.arrival),unstable=stage==='approach'&&s.altitude<400&&(s.gearPosition<.98||s.speed>a.approach*1.2||Math.abs(off.cross)>p.arrival.width||Math.abs(headingError(s.heading,runwayHeading(p.arrival)))>20||s.verticalSpeed< -900);
 if(!s.ground&&!s.fuelExhausted&&!unstable&&s.altitude>=200&&!['crashed','landed'].includes(stage)){
  const guidance=navigationGuidance(s,p),legChanged=guidance.leg!==prev.vectorLeg;
  if(guidance.recovered&&prev.offRoute)next.recoveredSince=prev.recoveredSince??s.elapsed;else next.recoveredSince=null;
  const recovered=next.recoveredSince!==null&&s.elapsed-next.recoveredSince>=3;
  const due=s.elapsed-next.lastVector>=18,initialLeg=s.elapsed-next.lastVector>=5&&legChanged;
  if(requestHeading||initialLeg||due&&guidance.offRoute||recovered){
   const heading=(Math.round(guidance.heading/5)*5)%360,error=headingError(heading,s.heading),turn=error<0?'left':'right',prefix=guidance.offRoute?'You are off the planned route. ':recovered?'Back on course. ':'';
   const instruction=Math.abs(error)>5?`turn ${turn} heading ${headingWords(heading)}`:`fly heading ${headingWords(heading)}`;
   emit(guidance.leg==='departure'?'Tower':'Approach',`vector-${++next.vectorSerial}`,`Skyward one, ${prefix}${instruction}. ${guidance.leg==='final'?'Intercept the runway centreline.':guidance.leg==='align'?'Vector to final approach.':'Vector to the next route waypoint.'}`);
   next.assignedHeading=heading;next.lastVector=s.elapsed;next.vectorLeg=guidance.leg;next.offRoute=guidance.offRoute;next.recoveredSince=null;
  }
 }else {next.recoveredSince=null;if(s.ground||s.fuelExhausted||unstable)next.assignedHeading=null;}
 if(!s.ground&&s.verticalSpeed< -50&&stage==='approach')for(const feet of [500,200,100,50,20,10])if(s.altitude<=feet&&!next.seen.includes(feet)){next.seen.push(feet);if(s.altitude>feet*.6)emit('Flight deck','height-'+feet,`${feet}${feet===50?' — flare gently.':''}`);}
 if(stage==='airborne'&&prev.stage==='approach')next.seen=[];
 const fuel=s.fuelExhausted?'empty':s.fuelKg/FUEL_PROFILES[p.aircraftType].capacity<.1?'low':'normal';
 if(fuel!==prev.fuel&&!['crashed','landed'].includes(stage)){next.fuel=fuel;if(fuel==='empty')emit('Flight deck','fuel-empty',s.ground?'Fuel exhausted. Engines stopped. Abort departure.':`Fuel exhausted. Engines out. Maintain control and glide near ${FUEL_PROFILES[p.aircraftType].glide} knots. Reach the destination runway if possible.`);else if(fuel==='low')emit('Flight deck','fuel-low','Low fuel. Plan to land soon.');}
 return next;
}

export function headingWords(heading:number){const digits=['zero','one','two','three','four','five','six','seven','eight','niner'];return (Math.round((heading%360+360)%360)||360).toString().padStart(3,'0').split('').map(n=>digits[Number(n)]).join(' ');}
export function radioReadback(r:RadioState){return `Skyward one, roger.${r.assignedHeading!==null?` Heading ${headingWords(r.assignedHeading)}.`:''} Assigned altitude ${r.altitude} feet.`;}
