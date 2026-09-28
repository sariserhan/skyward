import type {AirportGeometry} from '../types.ts';
import {planTaxi,taxiFrame,taxiSpeedProfile,type TaxiRoute} from './taxiRoute.ts';
import {runwayEnd,runwayOffset,headingError,nauticalMiles,FUEL_PROFILES,type FlightState,type FlightPlan} from './flightSimulator.ts';
export interface TaxiSession {route:TaxiRoute;time:number;parked:boolean;shutdown:boolean;}
/** The connector stays on the mapped arrival runway. Never reverse or jump to a remote exit. */
export function arrivalTaxi(s:FlightState,p:FlightPlan,airport:AirportGeometry):TaxiSession|null {
 if(s.phase!=='landed'||s.fuelExhausted)return null;
 const offset=runwayOffset(s,p.arrival);if(Math.abs(offset.cross)>p.arrival.width/2||offset.along<0||offset.along>p.arrival.length-400)return null;
 const found=planTaxi(airport,s,runwayEnd(p.arrival));if(!found)return null;
 const points=[{lat:s.lat,lon:s.lon},...found.points],meters=[0];for(let i=1;i<points.length;i++)meters.push(meters[i-1]+nauticalMiles(points[i-1],points[i])*1852);
 return {route:{...found,stop:points[0],points,meters,length:meters.at(-1)!},time:0,parked:false,shutdown:false};
}
export function stepTaxi(s:FlightState,p:FlightPlan,taxi:TaxiSession,dt:number):FlightState {
 if(taxi.shutdown||s.fuelKg<=0)return {...s,speed:0,throttle:0,enginePower:0,brakes:true,fuelExhausted:s.fuelKg<=0,fuelBurnKgHour:0};
 if(taxi.parked){const burn=FUEL_PROFILES[p.aircraftType].burn*.08;return {...s,speed:0,brakes:true,throttle:0,enginePower:0,fuelBurnKgHour:burn,fuelKg:Math.max(0,s.fuelKg-burn*dt/3600),elapsed:s.elapsed+dt};}
 taxi.time+=Math.max(0,Math.min(.1,dt));const t=taxi.time,travel=t<5?t*t/10:t-2.5,frame=taxiFrame(taxi.route,travel);taxi.parked=frame.parked;
 const burn=FUEL_PROFILES[p.aircraftType].burn*.12,fuelKg=Math.max(0,s.fuelKg-burn*dt/3600);
 return {...s,lat:frame.lat,lon:frame.lon,heading:(s.heading+Math.max(-20*dt,Math.min(20*dt,headingError(frame.heading,s.heading)))+360)%360,speed:frame.groundSpeed*Math.min(1,t/5),pitch:0,bank:0,altitude:0,throttle:frame.parked?0:.12,enginePower:frame.parked?0:.12,brakes:frame.parked,elapsed:s.elapsed+dt,fuelKg,fuelExhausted:fuelKg===0,fuelBurnKgHour:frame.parked?0:burn,assisted:true};
}
export function taxiDuration(taxi:TaxiSession){return taxiSpeedProfile(taxi.route).times.at(-1)!+2.5;}
