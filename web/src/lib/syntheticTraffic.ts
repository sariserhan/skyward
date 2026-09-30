import type {LiveFrame} from './liveMotion.ts';
import type {Aircraft,AirportGeometry,FlightRoute} from '../types.ts';
import {AIRPORTS} from './airportCatalog.ts';
import {operation,operationFrame,demoDestination,journey,journeyFrame,type Journey,type Operation,type DemoPose,type DemoModel,trafficFrame,compatibleModel} from './demoOperations.ts';
import {trackDistance} from './positionQuality.ts';
export interface SyntheticIdentity {airport:string;index:number;model:DemoModel;from:string;to:string;phase:string;gear:number;}
interface Flight {aircraft:Aircraft;op:Operation;trip:Journey|null;reverse:Journey|null;start:number;offset:number;parked:boolean;}
const flights=new Map<string,Flight>();let pinned:string|null=null;
export function pinSyntheticFlight(id:string|null){pinned=id;}
export function syntheticCount(observed:number){return observed<10?20-Math.max(0,observed):0;}
export function nearbyObserved(rows:Aircraft[],center:{lat:number;lon:number},radius:number,now:number){return rows.filter(a=>!a.simulation&&a.targetKind==='aircraft'&&a.observedAt!==null&&now-a.observedAt<=120000&&now-a.observedAt>=-5000&&a.lat!==null&&a.lon!==null&&trackDistance(a as {lat:number;lon:number},center)<=radius).length;}
export function syntheticDestination(port:string,index:number){return demoDestination(port,index%3===2?'b787':index%3?'a320':'b737',port.split('').reduce((n,c)=>n+c.charCodeAt(0),0),index);}
export function createSyntheticFleet(home:AirportGeometry,ports:Map<string,AirportGeometry>,now:number):Aircraft[]{
 const result:Aircraft[]=[];
 for(let i=0;i<20;i++){
  const id=`skyward-${home.id.toLowerCase()}-${i}`,existing=flights.get(id);if(existing){result.push(snapshot(existing,now));continue;}
  const model=compatibleModel(home,i%3===2?'b787':i%3?'a320':'b737');if(!model)continue;const op=operation(home,model,i);if(!op)continue;
  const range={b737:2800,a320:3000,b787:7500,regional:1600,bizjet:2000,turboprop:700}[model];
  const requested=ports.get(syntheticDestination(home.id,i));
  const candidates=[...(requested?[requested]:[]),...ports.values()].filter(p=>p.id!==home.id&&trackDistance(home,p)>80&&trackDistance(home,p)<range);
  const dest=candidates.find(p=>operation(p,model)!==null),other=dest?operation(dest,model):null,to=dest?.id??home.id,incoming=i%4===0||i%4===3;
  const trip=other?journey(incoming?other:op,incoming?op:other):null;
  const initial=i%8,offset=trip?(incoming?trip.departureSeconds+trip.cruiseSeconds+(initial===0?-90-i*30:60+i*12):initial===1?0:initial===2?op.departAt-op.serviceAt+op.takeoff*.3:initial===5?op.service+op.push*.5:trip.departureSeconds+10+i*7):(initial===0?0:initial===1?op.serviceAt:initial===2?op.departAt:initial===3?op.arrival+op.rollout+op.taxi*.4:op.end-20);
  const sim:SyntheticIdentity={airport:home.id,index:i,model,from:incoming?to:home.id,to:incoming?home.id:to,phase:'Preparing',gear:1};
  const aircraft:Aircraft={hex:id,callsign:`SKY${home.id}${String(101+i)}`,registration:`Skyward ${101+i}`,aircraftType:model==='b787'?'B789':model==='a320'?'A320':model==='b737'?'B738':model==='regional'?'E75L':model==='bizjet'?'C560':'AT76',targetKind:'aircraft',category:'A3',lat:home.lat,lon:home.lon,altitude:home.elevationFt??0,ground:false,groundSpeed:0,heading:0,verticalRate:0,observedAt:null,positionSource:'skyward-simulation',sourceType:'Skyward · simulated traffic',simulation:sim};
  const f={aircraft,op,trip,reverse:trip?journey(trip.destination,trip.origin):null,start:now,offset:Math.max(0,offset),parked:i>=16};flights.set(id,f);result.push(snapshot(f,now));
 }
 // Bound generated airport populations. Selected aircraft is held by its own object.
 while(flights.size>200){const key=[...flights.keys()].find(id=>id!==pinned);if(!key)break;flights.delete(key);}
 return result;
}
function pose(f:Flight,now:number):DemoPose {const elapsed=Math.max(0,(now-f.start)/1000),t=f.offset+elapsed;if(f.parked)return {...operationFrame(f.op,f.op.serviceAt+f.op.service*.5),phase:'parked at gate'};if(f.trip&&f.reverse){const at=t%(f.trip.end+f.reverse.end);return at<=f.trip.end?journeyFrame(f.trip,at):journeyFrame(f.reverse,at-f.trip.end);}return trafficFrame(f.op,0,t,{slot:f.op.end+120,period:f.op.end+1500});}
function snapshot(f:Flight,now:number):Aircraft {const p=pose(f,now);return {...f.aircraft,lat:p.lat,lon:p.lon,altitude:p.altitude,ground:p.ground,groundSpeed:p.groundSpeed,heading:p.heading,verticalRate:p.ground?0:p.phase==='landing'||p.phase==='descent'?-700:p.phase==='climb'?1200:0,simulation:{...f.aircraft.simulation!,phase:p.phase,gear:p.gear,...(f.trip&&f.reverse&&((f.offset+Math.max(0,(now-f.start)/1000))%(f.trip.end+f.reverse.end))>f.trip.end?{from:f.aircraft.simulation!.to,to:f.aircraft.simulation!.from}:{})}};}
export function syntheticAircraft(a:Aircraft,now:number){const f=flights.get(a.hex);return f?snapshot(f,now):a;}
export function syntheticFrame(a:Aircraft,now:number):LiveFrame|null{const f=flights.get(a.hex);if(!a.simulation||!f)return null;const p=pose(f,now),nearHome=trackDistance(p,f.op.airport)<25,port=p.airport===f.op.airport.id?f.op.airport:f.trip?.origin.airport.id===p.airport?f.trip.origin.airport:f.trip?.destination.airport;return {...p,time:now,estimated:false,age:0,simulated:true,gear:p.gear,arrivalElevationFt:port?.elevationFt??0,landingPhase:p.phase==='landing'?'approach' as const:p.phase==='rollout'?'rollout' as const:p.ground?(p.groundSpeed>0?'taxi' as const:'parked' as const):undefined,simulationElevationFt:port?(port.elevationFt??0)*(p.phase==='landing'||p.ground?1:nearHome?Math.max(0,Math.min(1,(25-trackDistance(p,f.op.airport))/13)):0):undefined};}
export function syntheticRoute(a:Aircraft):FlightRoute|null {const s=a.simulation;if(!s)return null;return {simulated:true,callsign:a.callsign,source:'Skyward fictional itinerary',sourceUrl:'',fetchedAt:0,status:'UNVERIFIED',airports:[s.from,s.to].map(id=>({...AIRPORTS[id],iata:id,icao:AIRPORTS[id].icao??id}))};}
export function clearSyntheticTraffic(){flights.clear();}

export function regionalSyntheticAircraft(a:Aircraft,center:{lat:number;lon:number},radius:number,now:number){const f=flights.get(a.hex);let current=f?snapshot(f,now):a;if(f&&pinned!==a.hex&&current.lat!==null&&current.lon!==null&&trackDistance(current as {lat:number;lon:number},center)>Math.max(25,radius)){f.start=now;current=snapshot(f,now);}return current;}

/** Same-tab error recovery only; keep the original simulation clock and itinerary. */
export function saveSyntheticFlight(hex:string){const f=flights.get(hex);return f?JSON.stringify(f):undefined;}
export function restoreSyntheticFlight(raw:string|undefined):Aircraft|null{
 try{if(!raw||raw.length>1500000)return null;const f=JSON.parse(raw) as Flight;
  if(!f.aircraft?.simulation||!/^skyward-[a-z0-9-]+-\d+$/.test(f.aircraft.hex)||!Number.isFinite(f.start)||!Number.isFinite(f.offset)||!Number.isFinite(f.op?.end))return null;
  const a=snapshot(f,Date.now());if(!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||!Number.isFinite(a.altitude))return null;
  flights.set(a.hex,f);return a;
 }catch{return null;}
}
