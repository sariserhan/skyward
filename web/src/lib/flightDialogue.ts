export type VoiceChannel='radio'|'captain';
export type DialogueContext={callsign:string;from?:string;to?:string;phase:string;altitude?:number|null;weather?:string};
export type DialogueLine={channel:VoiceChannel;speaker:'Tower'|'Captain';text:string};
const clean=(s:string|undefined,limit=90)=>s?.replace(/[\u0000-\u001f<>]/g,'').slice(0,limit)||'';
export function captainAnnouncement(c:DialogueContext){
 const route=c.to?`The displayed route ${c.from?`is from ${clean(c.from)} to`:'takes us to'} ${clean(c.to)}.`:'Route details are not available for this flight.';
 const phase=c.phase==='ground'?'We are on the ground. Please remain seated with your seat belt fastened.':c.phase==='approach'?'We are preparing for arrival. Please return your seat to the upright position and fasten your seat belt.':c.phase==='rollout'?'We have touched down. Please remain seated with your seat belt fastened while we slow down.':c.phase==='taxi'?'We are taxiing. Please remain seated until we reach our parking position.':c.phase==='parked'?'We are at our parking position. Thank you for flying with us.':c.phase==='climb'?'We are climbing. Please keep your seat belt fastened.':c.phase==='ready'?'Welcome aboard. Please fasten your seat belt as we prepare for departure.':`We are airborne.${Number.isFinite(c.altitude)&&c.altitude!>1000?` The displayed altitude is approximately ${Math.round(c.altitude!/1000)*1000} feet.`:''}`;
 return `This is your captain speaking. ${route} ${phase}${c.weather?` ${clean(c.weather,240)}`:''}`;
}
export function towerExchange(c:DialogueContext):DialogueLine[]{
 const call=clean(c.callsign)||'Skyward flight';
 const [tower,pilot]=c.phase==='ground'?['Report your ground status.','On the ground and monitoring.']:c.phase==='approach'?['Report final approach.','Continuing the approach.']:c.phase==='rollout'?['Report when clear of the runway.','Slowing down after touchdown.']:c.phase==='taxi'?['Report when parked.','Continuing taxi.']:c.phase==='parked'?['Parking report received.','At the parking position.']:c.phase==='ready'?['Report ready for departure.','Preparing for departure.']:['Report your flight status.',c.phase==='climb'?'Climbing.':'Airborne and monitoring.'];
 return [{channel:'radio',speaker:'Tower',text:`${call}, ${tower}`},{channel:'radio',speaker:'Captain',text:`${pilot} ${call}.`}];
}
/** Each phase is announced once per mounted flight; no catch-up backlog on resume. */
export class FlightDialogue {
 private seen=new Set<string>();
 next(c:DialogueContext,enabled:{radio:boolean;captain:boolean}):DialogueLine[]{
  const lines:DialogueLine[]=[];
  for(const channel of ['radio','captain'] as const){const key=`${channel}:${c.phase}`;if(!enabled[channel]||this.seen.has(key))continue;this.seen.add(key);lines.push(...(channel==='radio'?towerExchange(c):[{channel,speaker:'Captain' as const,text:captainAnnouncement(c)}]));}
  return lines;
 }
}

export class TurbulenceAnnouncement {
 private active=false;private last=-Infinity;
 update(strength:number,now:number,ground:boolean){
  if(ground||!Number.isFinite(strength)||strength<.15){this.active=false;return false;}
  if(strength<.35||this.active)return false;this.active=true;
  if(now-this.last<180000)return false;this.last=now;return true;
 }
}
export function turbulenceAnnouncement(weather?:string){return `This is your captain. We are entering an area of turbulence. Please fasten your seat belt and remain seated. Cabin crew, please secure the cabin and take your seats.${weather?` ${clean(weather,240)}`:''} Please keep your seat belt fastened until conditions improve.`;}

/** A calm message requires sustained valid conditions, never loss of weather coverage. */
export class TurbulenceRecovery {
 private armed=false;private calmSince:number|null=null;
 update(strength:number,now:number,ground:boolean,valid:boolean,onset=false){
  if(ground){this.armed=false;this.calmSince=null;return false;}
  if(onset)this.armed=true;
  if(!valid||!Number.isFinite(strength)||strength>=.15){this.calmSince=null;return false;}
  if(!this.armed)return false;
  this.calmSince??=now;
  if(now-this.calmSince<30000)return false;
  this.armed=false;this.calmSince=null;return true;
 }
}
export const turbulenceRecoveryAnnouncement='This is your captain. The ride is becoming smoother. Please keep your seat belt fastened whenever you are seated, as conditions can change. Thank you for your patience.';
