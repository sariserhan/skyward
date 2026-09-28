import type {AirportGeometry} from '../types.ts';
import {planTaxi,taxiFrame,taxiSpeedProfile,type TaxiRoute} from './taxiRoute.ts';
import {runwayEnd,runwayOffset,headingError,nauticalMiles,FUEL_PROFILES,movePoint,type FlightInput,type FlightState,type FlightPlan} from './flightSimulator.ts';
export interface TaxiSession {route:TaxiRoute;time:number;parked:boolean;shutdown:boolean;manual?:boolean;}
/** The connector stays on the mapped arrival runway. Never reverse or jump to a remote exit. */
export function arrivalTaxi(s:FlightState,p:FlightPlan,airport:AirportGeometry):TaxiSession|null {
 if(s.phase!=='landed'||s.fuelExhausted)return null;
 const offset=runwayOffset(s,p.arrival);if(Math.abs(offset.cross)>p.arrival.width/2||offset.along<0||offset.along>p.arrival.length-400)return null;
 const found=planTaxi(airport,s,runwayEnd(p.arrival));if(!found)return null;
 const points=[{lat:s.lat,lon:s.lon},...found.points],meters=[0];for(let i=1;i<points.length;i++)meters.push(meters[i-1]+nauticalMiles(points[i-1],points[i])*1852);
 return {route:{...found,stop:points[0],points,meters,length:meters.at(-1)!},time:0,parked:false,shutdown:false};
}
export function stepTaxi(s:FlightState,p:FlightPlan,taxi:TaxiSession,dt:number,input:FlightInput={pitch:0,roll:0,rudder:0}):FlightState {
 if(taxi.shutdown||s.fuelKg<=0||s.engineRunning===false)return {...s,speed:0,throttle:0,enginePower:0,brakes:true,fuelExhausted:s.fuelKg<=0,fuelBurnKgHour:0};
 if(taxi.parked){const burn=FUEL_PROFILES[p.aircraftType].burn*.08;return {...s,speed:0,brakes:true,throttle:0,enginePower:0,fuelBurnKgHour:burn,fuelKg:Math.max(0,s.fuelKg-burn*dt/3600),elapsed:s.elapsed+dt};}
 if(taxi.manual){
  const speed=Math.max(0,Math.min(25,s.speed+(s.throttle*3-.25-s.speed*.025-(s.brakes?5:0))*dt)),heading=(s.heading+(input.rudder+input.roll*.5)*Math.min(25,speed*2)*dt+360)%360,pos=movePoint(s,heading,speed*dt/3600),burn=FUEL_PROFILES[p.aircraftType].burn*(.08+.2*s.throttle);
  const goal=taxi.route.points.at(-1)!;taxi.parked=nauticalMiles(pos,goal)*1852<8&&speed<1&&s.brakes;
  const c=Math.cos(pos.lat*Math.PI/180),points=taxi.route.points.map(p=>({x:(p.lon-pos.lon)*111120*c,y:(p.lat-pos.lat)*111120}));let near=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/Math.max(.001,dx*dx+dy*dy)));near=Math.min(near,Math.hypot(a.x+t*dx,a.y+t*dy));}
  return {...s,...pos,speed,heading,pitch:0,bank:0,altitude:0,elapsed:s.elapsed+dt,enginePower:s.throttle,fuelKg:Math.max(0,s.fuelKg-burn*dt/3600),fuelBurnKgHour:burn,warning:taxi.parked?'At stand. Shut down engines.':near>35?'Away from the mapped taxi route. Stop and return to the highlighted path.':speed>15?'Taxi too fast. Reduce throttle and brake.':''};
 }
 taxi.time+=Math.max(0,Math.min(.25,dt));const t=taxi.time,travel=t<5?t*t/10:t-2.5,frame=taxiFrame(taxi.route,travel);taxi.parked=frame.parked;
 const burn=FUEL_PROFILES[p.aircraftType].burn*.12,fuelKg=Math.max(0,s.fuelKg-burn*dt/3600);
 return {...s,lat:frame.lat,lon:frame.lon,heading:(s.heading+Math.max(-20*dt,Math.min(20*dt,headingError(frame.heading,s.heading)))+360)%360,speed:frame.groundSpeed*Math.min(1,t/5),pitch:0,bank:0,altitude:0,throttle:frame.parked?0:.12,enginePower:frame.parked?0:.12,brakes:frame.parked,elapsed:s.elapsed+dt,fuelKg,fuelExhausted:fuelKg===0,fuelBurnKgHour:frame.parked?0:burn,assisted:true};
}
export function taxiDuration(taxi:TaxiSession){return taxiSpeedProfile(taxi.route).times.at(-1)!+2.5;}
