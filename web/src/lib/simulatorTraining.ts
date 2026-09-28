import {AIRFRAMES,FUEL_PROFILES,initialFlight,runwayStart,runwayEnd,runwayHeading,runwayOffset,movePoint,headingError,navigationGuidance,type FlightPlan,type FlightState} from './flightSimulator.ts';
export const LESSONS={free:{name:'Free flight',description:'Choose your route and assistance.'},takeoff:{name:'1 · First takeoff',description:'C172, Easy. Release brakes, accelerate, rotate and climb through 800 ft.'},pattern:{name:'2 · Traffic pattern',description:'C172, Easy. Fly a left-hand circuit back to the departure runway; fewer hints.'},crosswind:{name:'3 · Crosswind landing',description:'C172, Advanced. Start on final with a 12 kt crosswind. Align, flare and stop.'},glide:{name:'4 · Engine-out glide',description:'C172, Advanced. Start on final with engines out. Manage speed and reach the runway.'}};
export type Lesson=keyof typeof LESSONS;
export function trainingStart(p:FlightPlan):FlightState {
 const s=initialFlight(p);if(p.lesson==='pattern')s.assignedAltitude=1000;if(!['crosswind','glide'].includes(p.lesson??''))return s;
 const glide=p.lesson==='glide',pos=movePoint(runwayStart(p.arrival),runwayHeading(p.arrival)+180,glide?2:5);
 return {...s,...pos,phase:'approach',ground:false,nav:'final',navOrigin:pos,altitude:glide?1600:1700,speed:glide?FUEL_PROFILES[p.aircraftType].glide:AIRFRAMES[p.aircraftType].approach,heading:runwayHeading(p.arrival),pitch:glide?-1:-3,verticalSpeed:-500,brakes:false,flaps:glide?0:2,flapPosition:glide?0:2,throttle:glide?0:.45,enginePower:glide?0:.45,fuelKg:glide?0:s.fuelKg,fuelExhausted:glide,warning:glide?'Training engine failure: manage glide speed and reach the runway.':''};
}
export function landingCue(s:FlightState,p:FlightPlan){const off=runwayOffset(s,p.arrival),target=Math.max(0,(350-off.along)/1852*318),heightError=s.altitude-target;return {cross:off.cross,heightError,target,headingError:headingError(runwayHeading(p.arrival),s.heading),flare:!s.ground&&s.altitude<50&&s.verticalSpeed<0,score:Math.max(0,Math.round(100-Math.max(0,Math.abs(s.touchdownRate)-100)/8-Math.abs(off.cross)*.7))};}
export type HelpTarget='brakes'|'throttle'|'flaps'|'trim'|'controls'|'gear'|'pitch'|'bank'|'fuel';
export function copilotHelp(s:FlightState,p:FlightPlan):{text:string;target:HelpTarget}{
 if(s.phase==='crashed')return {text:'Review the debrief, then retry the lesson.',target:'controls'};
 if(s.phase==='landed')return {text:'Landing complete. Request taxi to a stand if a mapped route is available, or review and save your flight.',target:'controls'};
 if(s.phase==='rollout')return {text:'Reduce throttle to idle and apply brakes. Keep aligned with the runway while slowing down.',target:'brakes'};
 if(s.fuelExhausted&&!s.ground)return {text:`Engines out. Adjust pitch to hold about ${FUEL_PROFILES[p.aircraftType].glide} kt. Keep turns shallow and aim for the runway.`,target:'pitch'};
 if(s.warning.includes('STALL'))return {text:'Lower the nose and increase power. Level the wings to recover airspeed.',target:'pitch'};
 if(s.ground)return s.brakes?{text:'Select Release brakes or press B. Then increase throttle smoothly.',target:'brakes'}:s.speed<AIRFRAMES[p.aircraftType].rotate?{text:`Increase throttle and stay on the centreline. Rotate at ${AIRFRAMES[p.aircraftType].rotate} kt.`,target:'throttle'}:{text:'Raise the nose gently using Pitch up or W. Keep the wings level.',target:'pitch'};
 if(s.altitude<500&&s.verticalSpeed<0&&s.gearPosition<.98)return {text:'Extend the landing gear now. If it cannot lock before touchdown, go around.',target:'gear'};
 if(s.altitude>500&&s.verticalSpeed>0&&s.flaps>0)return {text:'Retract flaps as you accelerate; keep the climb stable.',target:'flaps'};
 const cue=navigationGuidance(s,p);return cue.offRoute?{text:`Turn ${cue.error<0?'left':'right'} toward heading ${Math.round(cue.heading)}°. Use a shallow bank and level out near the heading.`,target:'bank'}:{text:landingCue(s,p).flare?'Flare gently: raise the nose a little and reduce power; avoid a steep pull.':'On course. Use small pitch and throttle changes to maintain altitude and airspeed.',target:'pitch'};
}
export interface FlightSample {time:number;lat:number;lon:number;altitude:number;speed:number;fuel:number;phase:string;warning:string;}
export interface FlightLog {samples:FlightSample[];interval:number;events:{time:number;text:string}[];lastWarning:string;offRoute:boolean;maxAltitude:number;touchdown?:{rate:number;cross:number;score:number};}
export const initialLog=():FlightLog=>({samples:[],interval:2,events:[],lastWarning:'',offRoute:false,maxAltitude:0});
export function recordFlight(log:FlightLog,s:FlightState,p:FlightPlan){
 const offRoute=!s.ground&&s.altitude>=200&&navigationGuidance(s,p).offRoute;if(offRoute&&!log.offRoute){log.events.push({time:s.elapsed,text:'Off planned route — practice gentle heading corrections.'});if(log.events.length>100)log.events.shift();}log.offRoute=offRoute;
 log.maxAltitude=Math.max(log.maxAltitude,s.altitude);
 if(s.warning&&s.warning!==log.lastWarning){log.events.push({time:s.elapsed,text:s.warning});if(log.events.length>100)log.events.shift();}log.lastWarning=s.warning;
 if(!log.touchdown&&['rollout','landed','crashed'].includes(s.phase)){const cue=landingCue(s,p);log.touchdown={rate:s.touchdownRate,cross:cue.cross,score:s.phase==='crashed'?0:cue.score};}
 const last=log.samples.at(-1);if(!last||s.elapsed-last.time>=log.interval||s.phase!==last.phase){log.samples.push({time:s.elapsed,lat:s.lat,lon:s.lon,altitude:s.altitude,speed:s.speed,fuel:s.fuelKg,phase:s.phase,warning:s.warning});if(log.samples.length>1800){log.samples=log.samples.filter((_,i)=>i%2===0);log.interval*=2;}}
}
export function lessonResult(p:FlightPlan,s:FlightState,log:FlightLog){if(!p.lesson||p.lesson==='free')return '';const success=p.lesson==='takeoff'?log.maxAltitude>=800&&s.phase!=='crashed':s.phase==='landed';return s.phase==='crashed'?'Lesson ended — review and retry.':success?`Objective complete${s.assisted?' · assisted run':' · manual run'}.`:LESSONS[p.lesson].description;}
export function practiceSuggestion(log:FlightLog){return log.events.some(e=>e.text.includes('STALL'))?'Practice maintaining airspeed with small pitch changes.':log.touchdown&&log.touchdown.rate< -500?'Practice a shallower descent and a gentle flare.':log.touchdown&&Math.abs(log.touchdown.cross)>10?'Practice centreline alignment with small heading corrections.':'Practice a complete manual traffic pattern with steady airspeed.';}
