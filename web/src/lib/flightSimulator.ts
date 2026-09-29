import {advancedAerodynamics} from './advancedAerodynamics.ts';
import {weatherAt,type SimWeather} from './simulatorWeather.ts';
import type {Runway} from '../types';
export type Difficulty='easy'|'advanced';
export type FlightPhase='ready'|'takeoff'|'climb'|'cruise'|'approach'|'landing'|'rollout'|'landed'|'crashed';
export type AircraftType='B738'|'C172'|'C560';
export const AIRFRAMES={B738:{name:'Boeing 737-800',rotate:140,stall:120,approach:145,cruise:260,acceleration:6,minRunway:1800},C172:{name:'Cessna 172',rotate:55,stall:48,approach:65,cruise:110,acceleration:3,minRunway:650},C560:{name:'Citation V',rotate:105,stall:95,approach:115,cruise:240,acceleration:5,minRunway:1400}};
// Gameplay profiles, not operational fuel/load figures for a real aircraft.
export const HANDLING={B738:{pitchRate:5.5,rollRate:14,braking:9,steering:8,spool:2.5,gearDrag:.4},C172:{pitchRate:8,rollRate:25,braking:7,steering:18,spool:.5,gearDrag:.25},C560:{pitchRate:6,rollRate:19,braking:8,steering:12,spool:1.8,gearDrag:.35}};
export const FUEL_PROFILES={B738:{capacity:20000,burn:2600,glide:200,crew:6,passengers:162,maxPassengers:188},C172:{capacity:150,burn:24,glide:65,crew:1,passengers:2,maxPassengers:3},C560:{capacity:2500,burn:600,glide:125,crew:2,passengers:6,maxPassengers:7}};
export interface Point {lat:number;lon:number;}
export interface FlightPlan {coldStart?:boolean;weather?:SimWeather;lesson?:'free'|'takeoff'|'pattern'|'crosswind'|'glide';from:string;to:string;departure:Runway;arrival:Runway;difficulty:Difficulty;aircraftType:AircraftType;challenge:'calm'|'crosswind'|'precision';fuelPercent?:number;passengers?:number;}
export interface FlightState extends Point {practiceReset:boolean;battery:boolean;engineRunning:boolean;navLights:boolean;landingLights:boolean;altitude:number;speed:number;heading:number;pitch:number;bank:number;verticalSpeed:number;throttle:number;assignedAltitude:number;gear:boolean;gearPosition:number;flaps:number;flapPosition:number;enginePower:number;fuelKg:number;fuelBurnKgHour:number;fuelExhausted:boolean;fatalCrash:boolean;speedbrake:boolean;reverse:boolean;brakes:boolean;trim:number;autopilot:boolean;assisted:boolean;ground:boolean;phase:FlightPhase;elapsed:number;distance:number;touchdownRate:number;warning:string;nav:'departure'|'intercept'|'align'|'base'|'final';navOrigin:Point;}
export interface FlightInput {pitch:number;roll:number;rudder:number;}
const rad=Math.PI/180,clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const headingError=(to:number,from:number)=>((to-from+540)%360)-180;
export function headingTo(a:Point,b:Point){const d=(b.lon-a.lon)*rad;return (Math.atan2(Math.sin(d)*Math.cos(b.lat*rad),Math.cos(a.lat*rad)*Math.sin(b.lat*rad)-Math.sin(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos(d))/rad+360)%360;}
export function nauticalMiles(a:Point,b:Point){const dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 3440.065*2*Math.asin(Math.sqrt(clamp(h,0,1)));}
export function movePoint(p:Point,heading:number,nm:number):Point{const d=nm/3440.065,h=heading*rad,lat=p.lat*rad,lon=p.lon*rad,nlat=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(h)),nlon=lon+Math.atan2(Math.sin(h)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(nlat));return {lat:nlat/rad,lon:((nlon/rad+540)%360)-180};}
export const runwayStart=(r:Runway)=>({lon:r.a[0],lat:r.a[1]});
export const runwayEnd=(r:Runway)=>({lon:r.b[0],lat:r.b[1]});
export const runwayHeading=(r:Runway)=>headingTo(runwayStart(r),runwayEnd(r));
export function runwayOffset(point:Point,r:Runway){const start=runwayStart(r),d=nauticalMiles(start,point)*1852,angle=headingError(headingTo(start,point),runwayHeading(r))*rad;return {along:d*Math.cos(angle),cross:d*Math.sin(angle)};}
export function chooseRunway(runways:Runway[],toward:Point,departing:boolean,type:AircraftType){
 const candidates=runways.filter(r=>r.length>=AIRFRAMES[type].minRunway).flatMap(r=>[r,{...r,id:r.id.split('/').reverse().join('/'),a:r.b,b:r.a}]);
 candidates.sort((a,b)=>Math.abs(headingError(runwayHeading(a),departing?headingTo(runwayStart(a),toward):headingTo(toward,runwayEnd(a))))-Math.abs(headingError(runwayHeading(b),departing?headingTo(runwayStart(b),toward):headingTo(toward,runwayEnd(b)))));
 if(!candidates.length)throw Error(`No mapped runway long enough for ${AIRFRAMES[type].name}. Try a smaller aircraft or another airport.`);return candidates[0];
}
export function initialFlight(plan:FlightPlan):FlightState{return {practiceReset:false,battery:!plan.coldStart,engineRunning:!plan.coldStart,navLights:!plan.coldStart,landingLights:!plan.coldStart,...movePoint(runwayStart(plan.departure),runwayHeading(plan.departure),.05),altitude:0,speed:0,heading:runwayHeading(plan.departure),pitch:0,bank:0,verticalSpeed:0,throttle:0,assignedAltitude:3000,gear:true,gearPosition:1,flaps:1,flapPosition:1,enginePower:0,fuelKg:FUEL_PROFILES[plan.aircraftType].capacity*clamp(plan.fuelPercent??75,0,100)/100,fuelBurnKgHour:0,fuelExhausted:false,fatalCrash:false,speedbrake:false,reverse:false,brakes:true,trim:0,autopilot:false,assisted:false,ground:true,phase:'ready',elapsed:0,distance:0,touchdownRate:0,warning:'Release brakes, set takeoff flaps and increase throttle.',nav:'departure',navOrigin:runwayStart(plan.departure)};}
export function navigationLeg(s:FlightState,p:FlightPlan){
 const runway=p.arrival,heading=runwayHeading(runway),offset=runwayOffset(s,runway);
 const target=s.nav==='departure'?movePoint(runwayEnd(p.departure),runwayHeading(p.departure),2):s.nav==='intercept'?movePoint(runwayStart(runway),heading+180,10):s.nav==='align'?movePoint(runwayStart(runway),heading+180,5):movePoint(runwayStart(runway),heading,Math.max(1000,offset.along+1000)/1852);
 if(p.lesson==='pattern'&&s.nav==='intercept')return {origin:s.navOrigin,target:movePoint(movePoint(runwayEnd(p.departure),runwayHeading(p.departure),1),runwayHeading(p.departure)-90,1.5)};
 if(p.lesson==='pattern'&&s.nav==='align')return {origin:s.navOrigin,target:movePoint(movePoint(runwayStart(runway),heading+180,3),heading-90,1.5)};
 if(p.lesson==='pattern'&&s.nav==='base')return {origin:s.navOrigin,target:movePoint(runwayStart(runway),heading+180,3)};
 const origin=s.nav==='final'?movePoint(runwayStart(runway),heading+180,5):s.navOrigin;
 return {origin,target};
}
export function navigationGuidance(s:FlightState,p:FlightPlan){
 const {origin,target}=navigationLeg(s,p),course=headingTo(s,target),legHeading=headingTo(origin,target),angularDistance=nauticalMiles(origin,s)/3440.065;
 const crossTrackNm=Math.asin(clamp(Math.sin(angularDistance)*Math.sin(headingError(headingTo(origin,s),legHeading)*rad),-1,1))*3440.065;
 const wind=weatherAt(p.weather,s.elapsed,runwayHeading(p.arrival)+90,p.challenge==='crosswind'?12:0);
 const windCorrection=Math.asin(clamp(wind.speed*Math.sin((wind.direction-course)*rad)/Math.max(30,s.speed),-.5,.5))/rad;
 const heading=(course-windCorrection+360)%360,error=headingError(heading,s.heading),limit=s.nav==='final'?.1:s.nav==='align'?.25:.6;
 return {heading,error,crossTrackNm,offRoute:Math.abs(crossTrackNm)>limit||Math.abs(error)>(s.nav==='final'?10:25),recovered:Math.abs(crossTrackNm)<limit*.5&&Math.abs(error)<8,leg:s.nav};
}
export function flightGuidance(s:FlightState,p:FlightPlan){const a=AIRFRAMES[p.aircraftType];if(s.phase==='crashed')return s.warning;if(s.phase==='landed')return 'Arrival complete. Save this flight to your career.';if(s.ground&&s.phase!=='rollout')return s.brakes?`Release brakes. Rotate gently after ${a.rotate} kt.`:s.speed<a.rotate?`Accelerate to ${a.rotate} kt, then raise the nose gently.`:'Raise the nose gently to lift off.';if(s.phase==='rollout')return 'Throttle idle. Brake smoothly and stop on the runway.';if(s.phase==='approach'||s.phase==='landing')return `Align with runway ${p.arrival.id.split('/')[0]}. Gear down, landing flaps, ${a.approach} kt.`;return 'Climb, retract gear and flaps, then follow the destination bearing.';}
/** All UI paths use the same mechanical interlocks, including keyboard shortcuts. */
export function commandFlight(s:FlightState,p:FlightPlan,patch:Partial<FlightState>):FlightState {
 if(['landed','crashed'].includes(s.phase))return s;
 const next={...patch};
 if(s.autopilot&&next.autopilot!==false)for(const key of ['throttle','gear','flaps','trim','brakes','speedbrake','reverse'] as const)delete next[key];
 if(p.aircraftType==='C172'||s.ground)delete next.gear;
 if(p.aircraftType==='C172')delete next.speedbrake;
 if(!s.ground||p.aircraftType==='C172')delete next.reverse;
 if(next.engineRunning===true&&(!s.battery||s.fuelKg<=0||s.ground&&s.throttle>.15))delete next.engineRunning;
 if(next.engineRunning===false)next.autopilot=false;
 if(next.battery===false&&s.engineRunning===false)next.autopilot=false;
 if(next.throttle!==undefined)next.throttle=clamp(next.throttle,0,1);
 if(next.trim!==undefined)next.trim=clamp(next.trim,-10,10);
 if(next.flaps!==undefined)next.flaps=clamp(Math.round(next.flaps),0,2);
 if(next.autopilot&&(p.difficulty==='advanced'||s.fuelExhausted||s.engineRunning===false))delete next.autopilot;
 return {...s,...next};
}
export function goAround(s:FlightState,p:FlightPlan):FlightState {
 if(s.ground||s.fuelExhausted||['landed','crashed'].includes(s.phase))return s;
 return {...s,phase:'climb',nav:'departure',navOrigin:{lat:s.lat,lon:s.lon},throttle:1,flaps:1,speedbrake:false,reverse:false,pitch:Math.max(s.pitch,5),warning:'Go around: full power, climb, then retract gear after positive climb.'};
}
export function stepFlight(previous:FlightState,p:FlightPlan,input:FlightInput,seconds:number):FlightState{
 let s={...previous};if(['landed','crashed'].includes(s.phase))return s;
 const count=Math.max(1,Math.ceil(clamp(seconds,0,2)/.025)),dt=clamp(seconds,0,2)/count;
 for(let step=0;step<count;step++){
  if(['landed','crashed'].includes(s.phase))break;
  const a=AIRFRAMES[p.aircraftType],handling=HANDLING[p.aircraftType],wind=weatherAt(p.weather,s.elapsed,runwayHeading(p.arrival)+90,p.challenge==='crosswind'?12:0),r=p.arrival,offset=runwayOffset(s,r),destination=movePoint(runwayStart(r),runwayHeading(r),.18),distance=nauticalMiles(s,destination),intercept=movePoint(runwayStart(r),runwayHeading(r)+180,10),alignment=movePoint(runwayStart(r),runwayHeading(r)+180,5);
  s.elapsed+=dt;s.warning='';
  if(s.fuelKg<=0){s.fuelKg=0;s.fuelExhausted=true;s.engineRunning=false;s.autopilot=false;}
  if(!s.ground){const before=s.nav;
   if(s.nav==='departure'&&s.altitude>800)s.nav='intercept';
   if(s.nav==='intercept'&&nauticalMiles(s,p.lesson==='pattern'?navigationLeg(s,p).target:intercept)<.45)s.nav='align';
   if(s.nav==='align'&&nauticalMiles(s,p.lesson==='pattern'?navigationLeg(s,p).target:alignment)<.4)s.nav=p.lesson==='pattern'?'base':'final';
   if(s.nav==='base'&&nauticalMiles(s,navigationLeg(s,p).target)<.25)s.nav='final';
   if(s.nav!==before)s.navOrigin={lat:s.lat,lon:s.lon};
  }
  if(s.autopilot&&p.difficulty==='easy'){
   s.assisted=true;s.brakes=s.phase==='rollout';s.speedbrake=s.phase==='rollout';s.reverse=false;
   if(s.ground&&s.phase!=='rollout'){s.throttle=1;s.flaps=1;s.pitch+=(s.speed>a.rotate?Math.min(3*dt,8-s.pitch):-Math.min(3*dt,s.pitch));s.bank=0;s.heading=runwayHeading(p.departure);}
   else if(s.phase==='rollout'){s.throttle=0;s.pitch=0;s.bank=0;s.heading=(s.heading+clamp(headingError(runwayHeading(r)-clamp(offset.cross*.5,-8,8),s.heading),-5*dt,5*dt)+360)%360;}
   else{
    const {error}=navigationGuidance(s,p);s.bank=clamp(error*1.2,-25,25);
    const final=s.nav==='final',targetAltitude=final?Math.max(0,(350-offset.along)/1852*318):s.nav==='departure'?2500:p.lesson==='pattern'?1000:s.nav==='align'?1650:s.assignedAltitude;
    const targetSpeed=final||s.nav==='align'||s.nav==='base'||s.nav==='intercept'&&nauticalMiles(s,intercept)<3?a.approach:a.cruise;s.throttle=clamp(.43+(targetSpeed-s.speed)*.018,0,1);
    s.pitch=final?-3+clamp((targetAltitude-s.altitude)*.012,-3,3):clamp((targetAltitude-s.altitude)*.012,-4,10);if(final&&s.altitude<35)s.pitch=-1;
    s.gear=final||s.altitude<500;s.flaps=final?2:s.altitude<500?1:0;
   }
  }else{
   if(s.ground){const canRotate=s.phase!=='rollout'&&!s.brakes&&s.speed>=a.rotate*.95;s.pitch=canRotate?clamp(s.pitch+(input.pitch*3-(!input.pitch?2:0))*dt,0,8):Math.max(0,s.pitch-5*dt);s.bank=0;}
   else{s.pitch=clamp(s.pitch+(input.pitch*handling.pitchRate+s.trim*.4)*dt,-20,25);s.bank=clamp(s.bank+input.roll*handling.rollRate*dt,-60,60);}
   if(p.difficulty==='easy'){if(!input.roll)s.bank*=Math.exp(-dt*.5);s.pitch=clamp(s.pitch,-10,15);}
   if(s.ground)s.heading=(s.heading+(input.rudder+input.roll*.3)*Math.min(handling.steering,s.speed*.6)*dt+360)%360;
  }
  if(p.aircraftType==='C172'){s.gear=true;s.speedbrake=false;s.reverse=false;}
  if(s.ground)s.gear=true;
  s.gearPosition=clamp((s.gearPosition??Number(s.gear))+clamp(Number(s.gear)-(s.gearPosition??Number(s.gear)),-dt/7,dt/7),0,1);
  s.flapPosition=clamp((s.flapPosition??s.flaps)+clamp(s.flaps-(s.flapPosition??s.flaps),-dt/4,dt/4),0,2);
  const engineTarget=s.fuelExhausted||s.engineRunning===false?0:s.throttle;
  s.enginePower=(s.enginePower??engineTarget)+(engineTarget-(s.enginePower??engineTarget))*(1-Math.exp(-dt/handling.spool));
  s.fuelBurnKgHour=s.fuelExhausted||s.engineRunning===false?0:FUEL_PROFILES[p.aircraftType].burn*(.08+.92*s.enginePower);
  s.fuelKg=Math.max(0,s.fuelKg-s.fuelBurnKgHour*dt/3600);
  if(s.fuelKg===0){s.fuelExhausted=true;s.engineRunning=false;s.autopilot=false;s.fuelBurnKgHour=0;}
  if(!s.ground)s.reverse=false;
  const aero=advancedAerodynamics(s.speed,s.pitch,s.bank,s.altitude,p.aircraftType==='C172'?11:p.aircraftType==='C560'?16:35,s.ground);
  const advanced=p.difficulty==='advanced',ground=s.ground,drag=.15+s.speed*.009+s.gearPosition*handling.gearDrag+s.flapPosition*.18+(advanced?aero.inducedDrag:Math.max(0,s.pitch)*.07)+(s.speedbrake?1.8:0);
  const thrust=s.fuelExhausted||s.engineRunning===false?0:s.reverse&&ground&&p.aircraftType!=='C172'?-s.enginePower*a.acceleration*.65:s.enginePower*a.acceleration;
  s.speed=clamp(s.speed+(thrust-drag+(advanced?aero.gravity:(s.fuelExhausted||s.engineRunning===false)&&!ground?-Math.sin(s.pitch*rad)*19.06:0)-(ground&&s.brakes?handling.braking*(1-wind.rain*.3):0))*dt,0,a.cruise*1.6);
  const stallSpeed=a.stall*(1-s.flapPosition*.11)*Math.sqrt(1/Math.max(.5,Math.cos(s.bank*rad)));
  if(ground&&s.phase!=='rollout'&&s.speed>a.rotate&&s.pitch>3){s.ground=false;s.phase='climb';s.altitude=.1;}
  if(!s.ground){
   s.heading=(s.heading+((9.81*Math.tan(s.bank*rad)/Math.max(20,s.speed*.514444)/rad)+(s.autopilot?0:input.rudder*6))*dt+360)%360;
   let vs=s.speed*101.269*Math.sin(s.pitch*rad)-(advanced?aero.bankSink:0);
   if(s.fuelExhausted||s.engineRunning===false)vs-=Math.max(250,s.speed*101.269/(p.aircraftType==='C172'?9:15));
   if(s.speed<stallSpeed){s.warning='STALL — lower nose and add power';vs-=p.difficulty==='advanced'?1500:600;if(p.difficulty==='advanced')s.pitch-=4*dt;}
   if(p.difficulty==='advanced'&&s.pitch>18){s.warning='High angle of attack — lower nose';vs-=1200;}
   s.verticalSpeed+=(vs-s.verticalSpeed)*(1-Math.exp(-dt*2));s.altitude+=s.verticalSpeed/60*dt;
  }else{s.verticalSpeed=0;s.pitch=s.phase==='rollout'?Math.max(0,s.pitch-4*dt):Math.max(0,s.pitch);s.bank=0;s.altitude=0;}
  if(!s.ground&&wind.turbulence&&!s.autopilot){s.bank+=Math.sin(s.elapsed*2.1)*wind.turbulence*3*dt;s.verticalSpeed+=Math.sin(s.elapsed*1.7)*wind.turbulence*80*dt;}
  const travel=s.speed*dt/3600;s={...s,...movePoint(s,s.heading,travel)};s.distance+=travel;
  if(!s.ground&&wind.speed)s={...s,...movePoint(s,wind.direction,wind.speed*dt/3600)};
  if(s.altitude<=0&&!s.ground){
   const hit=runwayOffset(s,r),valid=hit.along>=0&&hit.along<=r.length&&Math.abs(hit.cross)<r.width/2&&Math.abs(headingError(s.heading,runwayHeading(r)))<12&&s.gear&&s.gearPosition>=.98&&Math.abs(s.bank)<10&&s.verticalSpeed> -(p.difficulty==='easy'?800:600)&&s.speed<a.approach*1.35;
   s.fatalCrash=!valid&&(s.verticalSpeed< -1000||s.speed>80);s.touchdownRate=s.verticalSpeed;s.pitch=clamp(s.pitch,0,8);s.bank=0;s.altitude=0;s.ground=true;s.phase=valid?'rollout':'crashed';s.warning=valid?'Touchdown. Idle throttle and apply brakes.':(!s.gear||s.gearPosition<.98)?'Gear-up landing. Restart and extend the gear before touchdown.':'Landing missed: check runway alignment, airspeed and descent rate.';
   if(valid&&p.difficulty==='easy'){s.brakes=true;s.throttle=0;}
  }
  if(s.phase==='crashed')break;
  if(!s.ground&&!s.warning){if(s.gearPosition>.01&&s.speed>(p.aircraftType==='B738'?250:200))s.warning='Gear overspeed — reduce airspeed';else if(s.flapPosition>.1&&s.speed>a.approach*1.5)s.warning='Flap overspeed — reduce airspeed';else if(s.altitude<500&&s.verticalSpeed< -150&&s.gearPosition<.98)s.warning='Landing gear not down and locked';}
  if(s.ground){const active=s.phase==='rollout'?r:p.departure,off=runwayOffset(s,active);if(s.speed>15&&(off.along>active.length+40||Math.abs(off.cross)>active.width/2+10)){s.fatalCrash=s.speed>80;s.phase='crashed';s.warning='Runway excursion. Restart and maintain the centreline.';}else if(s.phase==='rollout'&&s.speed<3){s.phase='landed';s.speed=0;}else if(s.phase==='ready'&&s.speed>1)s.phase='takeoff';}
  else if(s.altitude>0){s.phase=distance<6&&s.verticalSpeed<100?'approach':s.altitude>1500?'cruise':'climb';if(distance<1.5&&s.altitude<500)s.phase='landing';}
 }
 if(['landed','crashed'].includes(s.phase)){s.fuelBurnKgHour=0;if(s.phase==='crashed'){s.throttle=0;s.enginePower=0;}}
 if(!['landed','crashed'].includes(s.phase)){
  if(s.fuelExhausted)s.warning=s.ground?'Fuel exhausted — engines stopped. Re-plan with more fuel.':`ENGINE FAILURE — fuel exhausted. Glide near ${FUEL_PROFILES[p.aircraftType].glide} kt and find a runway.`;
  else if(s.engineRunning===false)s.warning=s.ground?'Engine stopped. Battery on, throttle idle, then Start engine.':`ENGINE STOPPED — glide near ${FUEL_PROFILES[p.aircraftType].glide} kt. Restart if fuel and battery are available.`;
  else if(s.fuelKg/FUEL_PROFILES[p.aircraftType].capacity<.1&&!s.warning)s.warning='LOW FUEL — plan to land soon.';
 }
 return s;
}
export function simulationOccupants(p:FlightPlan){const profile=FUEL_PROFILES[p.aircraftType];const passengers=clamp(Math.round(p.passengers??profile.passengers),0,profile.maxPassengers);return {passengers,crew:profile.crew,total:passengers+profile.crew};}
