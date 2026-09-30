import {GroundMotionClock,aircraftRadius,forgetGroundTraffic,groundConflict} from './groundSafety.ts';
import {arrivalParking} from './arrivalParking.ts';
import {planTaxi,type TaxiRoute} from './taxiRoute.ts';
import {landingRouteMode} from './landingRoute.ts';
import type {Aircraft,AirportGeometry,FlightRoute} from '../types.ts';
import type {LiveFrame} from './liveMotion.ts';
import {predictedLanding} from './landingPrediction.ts';
import {bearing} from './flightPresentation.ts';
import {trackDistance} from './positionQuality.ts';
const wrap=(n:number)=>((n+540)%360)-180;
interface Plan {clock?:GroundMotionClock;runwayStart:{lon:number;lat:number};runwayEnd:{lon:number;lat:number};goAround?:boolean;checked?:number;conflict?:string;aircraft:Aircraft;airport:AirportGeometry;route:FlightRoute|null;sourceTime:number;seed:Aircraft|null;pose:LiveFrame;entry:{lat:number;lon:number};last:number;heading:number;stage:'entry'|'final';layout?:TaxiRoute;}
export class WatchedArrival {
 private watched=new Set<string>();private plans=new Map<string,Plan>();private blocked=new Set<string>();
 watch(hex:string){this.watched.add(hex);this.blocked.delete(hex);return()=>{forgetGroundTraffic(hex);this.watched.delete(hex);this.plans.delete(hex);this.blocked.delete(hex);};}
 layout(hex:string){return this.plans.get(hex)?.layout??null;}
 stop(hex:string){forgetGroundTraffic(hex);this.plans.delete(hex);this.blocked.add(hex);}
 sample(a:Aircraft,now:number,route:FlightRoute|null|undefined,airport:AirportGeometry|null|undefined,displayed?:LiveFrame):LiveFrame|null{
  if(!this.watched.has(a.hex)||this.blocked.has(a.hex))return null;
  let p=this.plans.get(a.hex);
  if(p&&p.aircraft.callsign!==a.callsign){this.plans.delete(a.hex);return null;}
  if(!p){
   if(!airport||a.ground)return null;
   const fresh={...a,observedAt:now};let candidate=predictedLanding(fresh,now,route,airport);
   // A watched destination arrival can be on a base leg before runway alignment.
   // Select an illustrative runway, then fly a continuous intercept instead of snapping to it.
   if(!candidate&&route&&landingRouteMode(a.callsign,route,airport)&&!a.positionWarning&&a.targetKind==='aircraft'&&a.lat!==null&&a.lon!==null&&a.heading!==null&&a.altitude!==null&&(a.verticalRate??0)<-150&&(a.groundSpeed??0)>=80&&(a.groundSpeed??999)<=260&&a.altitude-airport.elevationFt!>0&&a.altitude-airport.elevationFt!<=4500&&trackDistance(a as {lat:number;lon:number},airport)<8){
    let score=Infinity;
    for(const r of airport.runways)for(const reverse of [false,true]){const from=reverse?r.b:r.a,to=reverse?r.a:r.b,h=bearing({lon:from[0],lat:from[1]},{lon:to[0],lat:to[1]}),rad=h*Math.PI/180;
     const proposed=predictedLanding({...fresh,lat:from[1]-Math.cos(rad)*4/60,lon:from[0]-Math.sin(rad)*4/(60*Math.cos(from[1]*Math.PI/180)),altitude:airport.elevationFt!+1800,heading:h,verticalRate:-600},now,route,airport);
     const error=Math.abs(wrap(h-a.heading));if(proposed&&error<score){score=error;candidate=proposed;}
    }
   }
   if(!candidate||a.lat===null||a.lon===null||a.altitude===null)return null;
   const visible=displayed&&!displayed.ground?displayed:{...candidate,lat:a.lat,lon:a.lon,altitude:a.altitude,heading:a.heading??candidate.heading};
   const seed={...fresh,lat:visible.lat,lon:visible.lon,altitude:visible.altitude,heading:visible.heading,groundSpeed:visible.groundSpeed??a.groundSpeed};
   const runway=airport.runways.find(r=>r.id.split('/').includes(candidate.runway));if(!runway)return null;
   const reverse=runway.id.split('/')[1]===candidate.runway,from=reverse?runway.b:runway.a,to=reverse?runway.a:runway.b,heading=bearing({lon:from[0],lat:from[1]},{lon:to[0],lat:to[1]});
   const nm=Math.max(6,Math.min(9,(visible.altitude-airport.elevationFt!)/318)),rad=heading*Math.PI/180;
   p={runwayStart:{lon:from[0],lat:from[1]},runwayEnd:{lon:to[0],lat:to[1]},aircraft:{...a},airport,route:route?structuredClone(route):null,sourceTime:a.observedAt!,seed:predictedLanding(seed,now,route,airport)?seed:null,pose:visible,entry:{lat:from[1]-Math.cos(rad)*nm/60,lon:from[0]-Math.sin(rad)*nm/(60*Math.cos(from[1]*Math.PI/180))},last:now,heading,stage:'entry'};
   const start={lon:from[0],lat:from[1]},end={lon:to[0],lat:to[1]};if(!planTaxi(airport,start,end,aircraftRadius(a.aircraftType))){const parking=arrivalParking(airport,start,end,aircraftRadius(a.aircraftType));if(parking?.gate.startsWith('illustrative'))p.layout=parking;}
   this.plans.set(a.hex,p);
  }
  if(p.checked===undefined||now-p.checked>=500){p.checked=now;p.conflict=groundConflict(a.hex,p.airport,p.runwayStart,p.runwayEnd,aircraftRadius(a.aircraftType),now);}const runwayConflict=p.conflict;
  if(p.seed&&runwayConflict){const current=p.clock?.currentTime()??now,approach=predictedLanding(p.seed,current,p.route,p.airport,true);if(approach&&!approach.ground&&approach.altitude-p.airport.elevationFt!<1800){p.pose={...approach};p.seed=null;p.clock=undefined;p.stage='entry';p.last=now;p.goAround=true;}}
  if(!p.seed){
   // If a stale display has already overshot, turn around through a circuit;
   // never snap or translate backward to an earlier received coordinate.
   let left=Math.min(300,Math.max(0,(now-p.last)/1000));p.last=now;
   while(left>0){const dt=Math.min(.25,left);left-=dt;const target=p.stage==='entry'?p.entry:{lat:p.entry.lat+Math.cos(p.heading*Math.PI/180)*3/60,lon:p.entry.lon+Math.sin(p.heading*Math.PI/180)*3/(60*Math.cos(p.entry.lat*Math.PI/180))};
    const course=p.heading*Math.PI/180,dx=(p.pose.lon-p.entry.lon)*60*Math.cos(p.entry.lat*Math.PI/180),dy=(p.pose.lat-p.entry.lat)*60,cross=dx*Math.cos(course)-dy*Math.sin(course),along=dx*Math.sin(course)+dy*Math.cos(course);
    const wanted=p.stage==='entry'?bearing(p.pose,target):p.heading-Math.max(-40,Math.min(40,Math.atan2(cross,.6)*180/Math.PI)),heading=(p.pose.heading+Math.max(-3*dt,Math.min(3*dt,wrap(wanted-p.pose.heading)))+360)%360,speed=Math.max(120,Math.min(180,p.aircraft.groundSpeed??150)),distance=speed*dt/3600;
    p.pose={...p.pose,altitude:p.pose.altitude+Math.max(-10*dt,Math.min(15*dt,p.airport.elevationFt!+1800-p.pose.altitude)),heading,groundSpeed:speed,lat:p.pose.lat+Math.cos(heading*Math.PI/180)*distance/60,lon:wrap(p.pose.lon+Math.sin(heading*Math.PI/180)*distance/(60*Math.cos(p.pose.lat*Math.PI/180)))};
    if(p.stage==='entry'&&trackDistance(p.pose,p.entry)<.5)p.stage='final';else if(p.stage==='final'&&along>6)p.stage='entry';
    const seed={...p.aircraft,...p.pose,ground:false,observedAt:now,verticalRate:-600};
    if(p.stage==='final'&&!runwayConflict&&predictedLanding(seed,now,p.route,p.airport)){p.seed=seed;p.goAround=false;break;}
   }
  }
  const f=p.seed?(p.clock??=new GroundMotionClock()).advance(a.hex,now,p.airport,aircraftRadius(a.aircraftType),time=>predictedLanding(p!.seed!,time,p!.route,p!.airport,true)!):{...p.pose,gear:0,landingPhase:'approach' as const,estimated:true as const};
  return f?{...f,time:p.sourceTime,age:Math.max(0,now-p.sourceTime),arrivalAnimation:true,arrivalGoAround:p.goAround,arrivalElevationFt:p.airport.elevationFt,arrivalRejoin:!p.seed}:null;
 }
}
