import {groundRouteClear,groundSegmentClear} from './groundSafety.ts';
import type {AirportGeometry} from '../types.ts';
import {AIRPORTS} from './airportCatalog.ts';
import {demoPlan,type DemoFlight} from './demoTraffic.ts';
import {taxiFrame,taxiSpeedProfile,type TaxiRoute} from './taxiRoute.ts';
import {bearing} from './flightPresentation.ts';
import {trackDistance} from './positionQuality.ts';
import {movePoint} from './flightSimulator.ts';

export const DEMO_HANDLING={
 b737:{approach:140,rotate:145,cruise:440,taxi:11,runway:1900,roll:1550,turn:28,service:150,height:33000,length:40},
 a320:{approach:135,rotate:140,cruise:435,taxi:11,runway:1800,roll:1450,turn:25,service:150,height:33000,length:38},
 b787:{approach:150,rotate:155,cruise:480,taxi:9,runway:2500,roll:2100,turn:40,service:210,height:37000,length:57},
 regional:{approach:125,rotate:130,cruise:400,taxi:10,runway:1500,roll:1200,turn:20,service:120,height:29000,length:33},
 bizjet:{approach:110,rotate:115,cruise:420,taxi:9,runway:1200,roll:950,turn:15,service:90,height:35000,length:20},
 turboprop:{approach:105,rotate:110,cruise:270,taxi:8,runway:1000,roll:800,turn:18,service:120,height:22000,length:27},
} as const;
type Point={lat:number;lon:number};
export type DemoModel=keyof typeof DEMO_HANDLING;
export interface Operation {pushRoute:TaxiRoute;outSeconds:number;airport:AirportGeometry;model:DemoModel;route:TaxiRoute;out:TaxiRoute;heading:number;start:Point;stop:Point;touch:Point;approach:Point;depart:Point;gate:Point;gateHeading:number;illustrative:boolean;arrival:number;rollout:number;taxi:number;service:number;push:number;backtrack:number;takeoff:number;climb:number;serviceAt:number;departAt:number;end:number;}
export interface DemoPose extends Point {altitude:number;heading:number;pitch:number;bank:number;ground:boolean;groundSpeed:number;gear:number;phase:string;gate:string;service:number;airport:string;}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const u=clamp(n);return u*u*(3-2*u);};
function line(a:Point,b:Point,u:number):Point {const x=clamp(u);return {lat:a.lat+(b.lat-a.lat)*x,lon:((a.lon+(((b.lon-a.lon+540)%360)-180)*x+540)%360)-180};}
function rounded(points:Point[],radius:number):Point[]{
 const sparse:Point[]=[points[0]];for(let i=1;i<points.length-1;i++){const a=sparse.at(-1)!,b=points[i],c=points[i+1],angle=Math.abs(((bearing(a,b)-bearing(b,c)+540)%360)-180);if(angle>8||trackDistance(a,b)*1852>radius*2)sparse.push(b);}sparse.push(points.at(-1)!);
 const result=[sparse[0]];for(let i=1;i<sparse.length-1;i++){const a=sparse[i-1],b=sparse[i],c=sparse[i+1],d1=trackDistance(a,b)*1852,d2=trackDistance(b,c)*1852,cut=Math.min(radius,d1*.4,d2*.4),u=line(b,a,cut/Math.max(1,d1)),v=line(b,c,cut/Math.max(1,d2));result.push(u);for(let j=1;j<=8;j++){const t=j/8;result.push(line(line(u,b,t),line(b,v,t),t));}}result.push(sparse.at(-1)!);return result;
}
function route(points:Point[],gate:string):TaxiRoute {const meters=[0];for(let i=1;i<points.length;i++)meters.push(meters.at(-1)!+trackDistance(points[i-1],points[i])*1852);return {points,meters,stop:points[0],length:meters.at(-1)!,gate};}
const basePlans=new WeakMap<AirportGeometry,Map<DemoModel,ReturnType<typeof demoPlan>>>();
/** Assigned stands are fictional. One aircraft owns the whole movement area at a time. */
export function operation(port:AirportGeometry,model:DemoModel,index=0):Operation|null {
 const h=DEMO_HANDLING[model],eligible={...port,runways:port.runways.filter(r=>r.length>=h.runway)};
 const clearance=model==='b787'?48:model==='bizjet'?23:30;let plans=basePlans.get(port);if(!plans){plans=new Map();basePlans.set(port,plans);}if(!plans.has(model))plans.set(model,demoPlan(eligible,clearance));const base=plans.get(model);if(!base)return null;
 const start={lon:base.runway.a[0],lat:base.runway.a[1]},heading=bearing(start,{lon:base.runway.b[0],lat:base.runway.b[1]}),stop=base.inbound.stop;
 // A broad illustrative stand fan avoids assigning six aircraft to one real gate.
 const original=base.inbound.points.at(-1)!,offset=index*120;
 const gate=index===0?original:[90,-90,180,0,135,-135,45,-45].map(angle=>movePoint(original,heading+angle,offset/1852)).find(p=>groundSegmentClear(port,original,p,clearance));if(!gate)return null;
 const points=[...base.inbound.points];if(index>0)points.push(gate);
 const curved=rounded(points,h.turn),roundedPoints=groundRouteClear(port,curved,clearance)?curved:points;
 if(!groundRouteClear(port,roundedPoints,clearance))return null;
 const inbound=route(roundedPoints,index?`Skyward stand ${index+1} (illustrative)`:base.inbound.gate),reversed=[...roundedPoints].reverse();
 // Reverse through a tug turn, stop, then taxi forward from that same heading.
 const outward=bearing(gate,reversed[1]),r=Math.min(15,h.turn*.5),local=(x:number,y:number)=>movePoint(movePoint(gate,outward,x/1852),outward+90,y/1852);
 let pushRoute:TaxiRoute|undefined,outPoints:Point[]|undefined;
 let join=1;while(join<reversed.length-1&&trackDistance(gate,reversed[join])*1852<80)join++;
 for(const side of [1,-1]){
  const pushPoints=[gate,local(20,0),...Array.from({length:32},(_,i)=>{const angle=(i+1)/32*Math.PI;return local(20+r*Math.sin(angle),side*r*(1-Math.cos(angle)));})];
  pushPoints.push(local(10,side*2*r));
  const q=pushPoints.at(-1)!,mergeStart=movePoint(q,outward,10/1852),end=reversed[join],endHeading=bearing(reversed[Math.max(0,join-1)],end),c=movePoint(mergeStart,outward,20/1852),d=movePoint(end,endHeading+180,20/1852);
  const merge=Array.from({length:33},(_,i)=>{const u=i/32,k=1-u;return {lon:k*k*k*mergeStart.lon+3*k*k*u*c.lon+3*k*u*u*d.lon+u*u*u*end.lon,lat:k*k*k*mergeStart.lat+3*k*k*u*c.lat+3*k*u*u*d.lat+u*u*u*end.lat};});
  const outgoing=rounded([q,...merge,...reversed.slice(join+1)],h.turn);
  if(groundRouteClear(port,pushPoints,clearance)&&groundRouteClear(port,outgoing,clearance)){pushRoute={...route(pushPoints,inbound.gate),startStopped:true};outPoints=outgoing;break;}
 }
 if(!pushRoute||!outPoints)return null;
 // Backtrack with a lateral offset and a rolling semicircle, never rotate in place.
 const turnRadius=Math.min(h.turn,Math.max(10,(base.runway.width-8)/2)),lineupAlong=turnRadius+30,stopAlong=trackDistance(start,stop)*1852;
 if(lineupAlong+15+h.roll+50>base.runway.length)return null;
 const runwayPoint=(along:number,side:number)=>movePoint(movePoint(start,heading,along/1852),heading+90,side/1852);
 let departurePoints:Point[]|undefined;
 for(const side of [1,-1]){
  const back=Array.from({length:65},(_,i)=>{const u=i/64;return runwayPoint(stopAlong+(lineupAlong-stopAlong)*u,side*2*turnRadius*smooth(u));});
  const turn=Array.from({length:49},(_,i)=>{const angle=i/48*Math.PI;return runwayPoint(lineupAlong-turnRadius*Math.sin(angle),side*turnRadius*(1+Math.cos(angle)));});
  const candidate=[...outPoints,...back.slice(1),...turn.slice(1),runwayPoint(lineupAlong+15,0)];if(groundRouteClear(port,candidate,clearance)){departurePoints=candidate;break;}
 }
 if(!departurePoints)return null;
 const out={...route(departurePoints,inbound.gate),startStopped:true},outSeconds=taxiSpeedProfile(out).times.at(-1)!*12/h.taxi;
 const taxi=taxiSpeedProfile(inbound).times.at(-1)!*12/h.taxi,service=h.service,push=taxiSpeedProfile(pushRoute).times.at(-1)!/.3;
 const touch=movePoint(start,heading,Math.min(350,base.runway.length*.12)/1852),approach=movePoint(start,heading+180,3.5);
 const arrival=trackDistance(approach,touch)/h.approach*3600,rollout=trackDistance(touch,stop)*1852/((h.approach*.514444+6)/2);
 const backtrack=0,takeoff=2*h.roll/(h.rotate*.514444),climb=60;
 const serviceAt=arrival+rollout+taxi,departAt=serviceAt+service+push+outSeconds;
 return {pushRoute,outSeconds,airport:port,model,route:inbound,out,heading,start:departurePoints.at(-1)!,stop,touch,approach,depart:movePoint(departurePoints.at(-1)!,heading,(h.roll+h.rotate*.514444*climb)/1852),gate,gateHeading:bearing(points.at(-2)!,gate),illustrative:index>0||inbound.gate.includes('illustrative'),arrival,rollout,taxi,service,push,backtrack,takeoff,climb,serviceAt,departAt,end:departAt+takeoff+climb};
}
export function operationFrame(o:Operation,time:number):DemoPose {
 const h=DEMO_HANDLING[o.model],e=o.airport.elevationFt??0,t=Math.max(0,time),base={...o.approach,altitude:e+1900,heading:o.heading,pitch:2,bank:0,ground:false,groundSpeed:h.approach,gear:1,phase:'landing',gate:o.route.gate,service:0,airport:o.airport.id};
 if(t<o.arrival){const u=t/o.arrival,remaining=1-u;return {...base,...line(o.approach,o.touch,u),altitude:e+1900*(remaining<.06?remaining*remaining/.06:remaining),pitch:2+3*smooth((u-.9)/.1)};}
 let x=t-o.arrival;
 if(x<o.rollout){const u=x/o.rollout,v0=h.approach*.514444,v1=6,f=(v0*u+(v1-v0)*u*u/2)/((v0+v1)/2);return {...base,...line(o.touch,o.stop,f),altitude:e,ground:true,groundSpeed:(v0+(v1-v0)*u)/.514444,pitch:5*(1-smooth(u*4)),phase:'rollout'};}
 x-=o.rollout;
 if(x<o.taxi){const f=taxiFrame(o.route,x*h.taxi/12);return {...base,...f,altitude:e,ground:true,groundSpeed:f.groundSpeed*h.taxi/12,pitch:0,phase:'taxi in'};}
 x-=o.taxi;
 const parked={...base,...o.gate,heading:o.gateHeading,altitude:e,ground:true,groundSpeed:0,pitch:0};
 if(x<o.service)return {...parked,phase:x<o.service*.3?'deboarding':x<o.service*.65?'servicing':x<o.service*.9?'boarding':'ready for pushback',service:x/o.service};
 x-=o.service;
 // Pushback heading opposes tug travel; both ends stop before forward taxi.
 if(x<o.push){const f=taxiFrame(o.pushRoute,x*.3);return {...parked,...f,heading:(f.heading+180)%360,phase:'pushback',groundSpeed:f.groundSpeed*.3};}
 x-=o.push;
 if(x<o.outSeconds){const f=taxiFrame(o.out,x*h.taxi/12);return {...parked,...f,phase:trackDistance(f,o.stop)*1852<150||trackDistance(f,o.start)<trackDistance(o.stop,o.start)?'runway backtrack':'taxi out',groundSpeed:f.groundSpeed*h.taxi/12};}
 x-=o.outSeconds;
 if(x<o.takeoff){const u=x/o.takeoff;return {...parked,...movePoint(o.start,o.heading,h.roll*u*u/1852),heading:o.heading,phase:'takeoff',groundSpeed:h.rotate*u,pitch:8*smooth((u-.85)/.15)};}
 x-=o.takeoff;const u=clamp(x/o.climb),distance=h.roll+h.rotate*.514444*o.climb*u;
 return {...base,...movePoint(o.start,o.heading,distance/1852),phase:'climb',altitude:e+1900*smooth(u),ground:false,groundSpeed:h.rotate,pitch:8-4*smooth(u),gear:1-smooth((u-.1)/.4)};
}
export function trafficSchedule(operations:Operation[]){const slot=Math.max(...operations.map(o=>o.end))+120;return {slot,period:slot*operations.length};}
/** A conservative reservation: only one flight approaches, taxis or departs per slot. */
export function trafficFrame(o:Operation,index:number,time:number,schedule:{slot:number;period:number}):DemoPose {
 const t=((time-index*schedule.slot)%schedule.period+schedule.period)%schedule.period;
 if(t<o.end)return operationFrame(o,t);
 const a=operationFrame(o,o.end),b=operationFrame(o,0);
 const holdTime=schedule.period-o.end,entry=180,exit=180,circleTime=Math.max(1,holdTime-entry-exit),loops=Math.max(1,Math.round(circleTime/300)),radius=circleTime*240/3600/(loops*2*Math.PI),anchor=movePoint(b,b.heading+180,10),center=movePoint(anchor,b.heading-90,radius),local=t-o.end,lane=6000+index*1200+(o.airport.elevationFt??0);
 const curve=(from:Point,to:Point,fromHeading:number,toHeading:number,u:number)=>{const c=movePoint(from,fromHeading,4),d=movePoint(to,toHeading+180,4),k=1-u;return {lon:k*k*k*from.lon+3*k*k*u*c.lon+3*k*u*u*d.lon+u*u*u*to.lon,lat:k*k*k*from.lat+3*k*k*u*c.lat+3*k*u*u*d.lat+u*u*u*to.lat};};
 let p:Point,q:Point,altitude:number,heading:number,bank=0;
 if(local<entry){const u=local/entry;p=curve(a,anchor,a.heading,b.heading,u);q=curve(a,anchor,a.heading,b.heading,Math.min(1,u+.001));heading=bearing(p,q);altitude=a.altitude+(lane-a.altitude)*smooth(u);}
 else if(local<entry+circleTime){const theta=(local-entry)/circleTime*loops*360;p=movePoint(center,b.heading+90-theta,radius);heading=((b.heading-theta)%360+360)%360;altitude=lane;bank=-18;}
 else {const u=(local-entry-circleTime)/exit;p=curve(anchor,b,b.heading,b.heading,u);q=curve(anchor,b,b.heading,b.heading,Math.min(1,u+.001));heading=bearing(p,q);altitude=lane+(b.altitude-lane)*smooth(u);}
 return {...a,...p,heading,altitude,bank,pitch:0,gear:local>holdTime-30?smooth((local-holdTime+30)/25):0,phase:'airborne · awaiting runway slot',groundSpeed:240};
}
// Great-circle route, including departure and approach alignment segments.
function greatCircle(a:Point,b:Point,u:number):Point {const r=Math.PI/180,to=(p:Point)=>[Math.cos(p.lat*r)*Math.cos(p.lon*r),Math.cos(p.lat*r)*Math.sin(p.lon*r),Math.sin(p.lat*r)],x=to(a),y=to(b),angle=Math.acos(Math.max(-1,Math.min(1,x.reduce((v,n,i)=>v+n*y[i],0))));if(angle<1e-6)return line(a,b,u);const f=Math.sin((1-u)*angle)/Math.sin(angle),g=Math.sin(u*angle)/Math.sin(angle),v=x.map((n,i)=>n*f+y[i]*g);return {lat:Math.atan2(v[2],Math.hypot(v[0],v[1]))/r,lon:Math.atan2(v[1],v[0])/r};}
export interface Journey {origin:Operation;destination:Operation;model:DemoModel;departureSeconds:number;cruiseSeconds:number;end:number;distance:number;points:Point[];meters:number[];}
export function journey(origin:Operation,destination:Operation):Journey {
 const a=operationFrame(origin,origin.end),b=operationFrame(destination,0),distance=trackDistance(a,b),h=DEMO_HANDLING[origin.model];
 const lead=Math.min(10,distance*.12),c=movePoint(a,a.heading,lead),d=movePoint(b,b.heading+180,lead),points:Point[]=[];
 // Rounded route vertices give heading changes room instead of instant turns.
 const anchors=[a,c,...Array.from({length:31},(_,i)=>greatCircle(c,d,(i+1)/32)),d,b];
 for(let i=0;i<anchors.length-1;i++){const prev=anchors[Math.max(0,i-1)],p=anchors[i],q=anchors[i+1],next=anchors[Math.min(anchors.length-1,i+2)];for(let j=0;j<8;j++){const u=j/8,u2=u*u,u3=u2*u,lon=(v:number)=>p.lon+((v-p.lon+540)%360-180);const calc=(k:'lat'|'lon')=>{const z=k==='lon'?[lon(prev.lon),p.lon,lon(q.lon),lon(next.lon)]:[prev.lat,p.lat,q.lat,next.lat];return .5*((2*z[1])+(-z[0]+z[2])*u+(2*z[0]-5*z[1]+4*z[2]-z[3])*u2+(-z[0]+3*z[1]-3*z[2]+z[3])*u3);};points.push({lat:calc('lat'),lon:((calc('lon')+540)%360)-180});}}
 points.push(b);const meters=[0];for(let i=1;i<points.length;i++)meters.push(meters.at(-1)!+trackDistance(points[i-1],points[i])*1852);
 const ramp=Math.min(90,meters.at(-1)!/(h.cruise*.514444*4)),cruiseSeconds=meters.at(-1)!/(h.cruise*.514444)+ramp*(1-(a.groundSpeed+b.groundSpeed)/(2*h.cruise)),departureSeconds=origin.end-origin.serviceAt;
 return {origin,destination,model:origin.model,departureSeconds,cruiseSeconds,end:departureSeconds+cruiseSeconds+destination.serviceAt,distance:meters.at(-1)!/1852,points,meters};
}
function enroute(j:Journey,time:number):DemoPose {
 const u=clamp(time/j.cruiseSeconds),total=j.meters.at(-1)!,h=DEMO_HANDLING[j.model],ramp=Math.min(90,total/(h.cruise*.514444*4)),v0=h.rotate*.514444,v1=DEMO_HANDLING[j.destination.model].approach*.514444,vc=total/(j.cruiseSeconds-ramp)-(v0+v1)*ramp/(2*(j.cruiseSeconds-ramp)),t=Math.max(0,Math.min(time,j.cruiseSeconds));
 const integral=(x:number)=>{const a=clamp(x);return a*a*a-a*a*a*a/2;};
 const first=v0*ramp+(vc-v0)*ramp*.5,middle=vc*(j.cruiseSeconds-2*ramp);
 const distance=t<ramp?v0*t+(vc-v0)*ramp*integral(t/ramp):t<j.cruiseSeconds-ramp?first+vc*(t-ramp):first+middle+vc*(t-j.cruiseSeconds+ramp)+(v1-vc)*ramp*integral((t-j.cruiseSeconds+ramp)/ramp);
 const speed=t<ramp?v0+(vc-v0)*smooth(t/ramp):t<j.cruiseSeconds-ramp?vc:vc+(v1-vc)*smooth((t-j.cruiseSeconds+ramp)/ramp);
 let k=1;while(k<j.meters.length-1&&j.meters[k]<distance)k++;const f=(distance-j.meters[k-1])/Math.max(.01,j.meters[k]-j.meters[k-1]),p=line(j.points[k-1],j.points[k],f),a=operationFrame(j.origin,j.origin.end),b=operationFrame(j.destination,0),cruise=Math.max(a.altitude,b.altitude,Math.min(DEMO_HANDLING[j.model].height,Math.min(a.altitude,b.altitude)+j.cruiseSeconds*.25*35/1.5)),altitude=u<.25?a.altitude+(cruise-a.altitude)*smooth(u*4):u>.75?b.altitude+(cruise-b.altitude)*smooth((1-u)*4):cruise;
 const heading=bearing(j.points[k-1],j.points[k]),previous=bearing(j.points[Math.max(0,k-2)],j.points[k-1]),delta=((heading-previous+540)%360)-180,segmentSeconds=(j.meters[k]-j.meters[k-1])/(DEMO_HANDLING[j.model].cruise*.514444),bank=Math.max(-25,Math.min(25,Math.atan(DEMO_HANDLING[j.model].cruise*.514444*(delta*Math.PI/180)/Math.max(1,segmentSeconds)/9.81)*180/Math.PI));
 return {...a,...p,heading,bank,altitude,gear:smooth((u-.97)/.025),pitch:u<.25?4:u>.75?-3:0,phase:u<.25?'climb':u>.75?'descent':'cruise',airport:u>.5?j.destination.airport.id:j.origin.airport.id,groundSpeed:speed/.514444};}
export function journeyFrame(j:Journey,time:number):DemoPose {if(time<j.departureSeconds)return operationFrame(j.origin,j.origin.serviceAt+Math.max(0,time));if(time<j.departureSeconds+j.cruiseSeconds)return enroute(j,time-j.departureSeconds);const t=time-j.departureSeconds-j.cruiseSeconds;if(t>=j.destination.serviceAt)return {...operationFrame(j.destination,j.destination.serviceAt),phase:'parked at destination',service:1};const f=operationFrame(j.destination,t);return f;}
export interface DemoSave {version:2;airport:string;seed:number;time:number;speed:number;paused:boolean;flight:string;camera:string;journey:boolean;journeyTime:number;}
export function parseDemoSave(raw:string|null,airport:string):DemoSave|null {try{const v=JSON.parse(raw??'null');if(v?.version!==2||v.airport!==airport||!Number.isInteger(v.seed)||v.seed<0||v.seed>4294967295||![v.time,v.journeyTime].every(n=>Number.isFinite(n)&&n>=0&&n<=1e9)||![1,5,15,60,120].includes(v.speed)||typeof v.paused!=='boolean'||typeof v.journey!=='boolean'||!/^skyward-demo-[0-5]$|^$/.test(v.flight)||!['side','cockpit','cabin','tower','free'].includes(v.camera))return null;return v;}catch{return null;}}
export function serviceVehicles(o:Operation,f:DemoPose){const active=['deboarding','servicing','boarding','ready for pushback','pushback'].includes(f.phase),length=DEMO_HANDLING[o.model].length;return [{kind:'tug',show:active&&f.phase==='pushback',...movePoint(f,f.heading,length*.42/1852)},{kind:'baggage',show:active&&f.phase!=='pushback',...movePoint(f,f.heading+100,(length*.3+5)/1852)},{kind:'stairs',show:active&&['boarding','deboarding'].includes(f.phase),...movePoint(movePoint(f,f.heading,length*.22/1852),f.heading-90,8/1852)}];}
export function compatibleModel(port:AirportGeometry,wanted:DemoFlight['model']):DemoModel|null {const longest=Math.max(0,...port.runways.map(r=>r.length));return DEMO_HANDLING[wanted].runway<=longest?wanted:(Object.keys(DEMO_HANDLING) as DemoModel[]).find(m=>DEMO_HANDLING[m].runway<=longest)??null;}

export function demoDestination(airport:string,model:DemoModel,seed:number,index:number){const range={b737:2800,a320:3000,b787:7500,regional:1600,bizjet:2000,turboprop:700}[model],origin=AIRPORTS[airport],candidates=Object.keys(AIRPORTS).filter(id=>{const distance=trackDistance(origin,AIRPORTS[id]);return id!==airport&&distance>80&&distance<range;});return candidates[((Math.imul(seed+index+1,1664525)>>>0)%candidates.length)]??airport;}
