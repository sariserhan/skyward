import airports from '../data/airport-catalog.json' with {type:'json'};
import timezones from '../data/airport-timezones.json' with {type:'json'};
const km=(a,b)=>{const r=Math.PI/180,s=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(s)));};
export function travelCompanion(j,a,now){
 const from=airports[j.from],to=airports[j.to],details=j.details;
 const verified=details?.mode==='live'&&['MATCHED_RECENT_AIRCRAFT','MATCHED_DATED_FLIGHT'].includes(details.status)&&Number.isFinite(details.fetchedAt)&&now-details.fetchedAt>=-5000&&now-details.fetchedAt<900000;
 const flight=verified?details.flight:null,total=from&&to?km(from,to):0,remaining=a&&to?km(a,to):null,fromDistance=a&&from?km(a,from):null;
 const onRoute=remaining!==null&&fromDistance!==null&&total>10&&fromDistance+remaining<total+Math.max(50,total*.2);
 return {progress:onRoute?Math.round(Math.max(0,Math.min(100,100*(1-remaining/total)))):null,remainingKm:onRoute?Math.round(remaining):null,progressLabel:'Straight-line route estimate',destinationTimeZone:timezones[j.to]||null,arrivalEstimate:Number.isFinite(flight?.arrival?.estimatedAt)?flight.arrival.estimatedAt:null,arrivalStatus:typeof flight?.status==='string'?flight.status.slice(0,40):null,detailsCheckedAt:verified?details.fetchedAt:null,ground:typeof a?.ground==='boolean'?a.ground:null,nearOrigin:fromDistance!==null&&fromDistance<10,nearDestination:remaining!==null&&remaining<10};
}
export function observedMilestones(previous,current,now){
 const rows=[];
 if(current.arrivalStatus==='landed'&&previous?.arrivalStatus!=='landed')rows.push({kind:'arrival',label:'Arrival reported by flight details',source:'reported',time:now});
 if(previous?.observedAt&&current.observedAt&&current.observedAt>previous.observedAt&&current.observedAt-previous.observedAt<=120000){
  if(previous.ground===true&&previous.nearOrigin&&current.ground===false)rows.push({kind:'departure',label:'Ground-to-air transition near departure',source:'observed',time:current.observedAt});
  if(previous.ground===false&&current.ground===true&&current.nearDestination)rows.push({kind:'landing',label:'Possible landing observed near destination',source:'observed',time:current.observedAt});
 }
 return rows;
}
