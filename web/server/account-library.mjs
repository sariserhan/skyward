import {validateReplay,librarySummary} from './simulator-replay.mjs';
import {validBackupValue} from '../src/lib/localBackup.ts';
import {parseRecording} from '../src/lib/sessionRecording.ts';
import airports from '../data/airport-catalog.json' with {type:'json'};
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const text=(v,n=100)=>typeof v==='string'?v.trim().slice(0,n):'';
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const LIBRARY_LIMITS={watchlist:{count:30,bytes:1024,free:true},views:{count:10,bytes:65536},recordings:{count:10,bytes:2*1024*1024},logbook:{count:500,bytes:2048},simulator:{count:5,bytes:16*1024*1024},trips:{count:30,bytes:16384},journal:{count:200,bytes:512*1024},airports:{count:12,bytes:65536},missions:{count:100,bytes:512*1024}};
const setupKeys=new Set(['skyward.map.v1','skyward.flight-view.v1','skyward.camera-bookmarks.v1','skyward.favorites.v1','skyward.cabin-audio.v1']);
export function validateLibrary(kind,value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Choose a valid saved item.');
 if(kind==='watchlist'){
  if(!/^[a-f0-9]{6}$/.test(value.hex))fail(400,'Invalid aircraft identifier.');
  return {hex:value.hex,callsign:text(value.callsign,16),registration:text(value.registration,32),aircraftType:text(value.aircraftType,16)};
 }
 if(kind==='views'){
  const settings={};for(const [key,v] of Object.entries(value.settings??{})){if(!setupKeys.has(key)||typeof v!=='string'||v.length>50000)fail(400,'Invalid viewing setting.');if(key==='skyward.cabin-audio.v1'?!['on','off'].includes(v):!validBackupValue(key,v))fail(400,'Invalid viewing settings.');settings[key]=v;}
  return {name:text(value.name,80)||'My viewing setup',settings};
 }
 if(kind==='recordings'){try{return parseRecording(value);}catch(e){fail(400,e.message);}}
 if(kind==='logbook'){
  const from=text(value.from,4).toUpperCase(),to=text(value.to,4).toUpperCase();
  if(!date(value.date)||!Object.hasOwn(airports,from)||!Object.hasOwn(airports,to)||from===to)fail(400,'Choose a date and two different airports from the directory.');
  if(!Number.isFinite(value.durationMinutes)||value.durationMinutes<0||value.durationMinutes>1500)fail(400,'Duration must be between 0 and 1,500 minutes.');
  return {date:value.date,from,to,callsign:text(value.callsign,16),aircraftType:text(value.aircraftType,20),registration:text(value.registration,32),durationMinutes:Math.round(value.durationMinutes),notes:text(value.notes,500)};
 }
 if(kind==='trips'){
  if(!Array.isArray(value.legs)||!value.legs.length||value.legs.length>12)fail(400,'A trip needs 1–12 legs.');
  const legs=value.legs.map(l=>{if(!l||!Object.hasOwn(airports,l.from)||!Object.hasOwn(airports,l.to)||l.from===l.to||!Number.isFinite(l.departureAt)||!Number.isFinite(l.arrivalAt)||l.arrivalAt<=l.departureAt||l.arrivalAt-l.departureAt>48*3600000||l.departureAt<0||l.arrivalAt>8640000000000000)fail(400,'Use valid airports and UTC times for every leg.');return {from:l.from,to:l.to,callsign:text(l.callsign,16),journeyKey:text(l.journeyKey,100),departureAt:l.departureAt,arrivalAt:l.arrivalAt};});
  for(let i=1;i<legs.length;i++)if(legs[i].departureAt<legs[i-1].arrivalAt||legs[i].from!==legs[i-1].to)fail(400,'Connect legs at the same airport in chronological order.');
  return {name:text(value.name,80)||'My trip',legs};
 }
 if(kind==='journal'){
  if(!date(value.date)||!Object.hasOwn(airports,value.airport))fail(400,'Choose a sighting date and airport.');
  const photo=typeof value.photo==='string'?value.photo:'';if(photo&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))fail(400,'Use a JPEG, PNG or WebP photo.');
  if(photo.length>480000)fail(413,'Resize the photo below 350 KB.');
  return {date:value.date,airport:value.airport,callsign:text(value.callsign,16),registration:text(value.registration,32),aircraftType:text(value.aircraftType,20),airline:text(value.airline,80),notes:text(value.notes,1000),collection:text(value.collection,50),photo};
 }
 if(kind==='airports'){
  if(!Object.hasOwn(airports,value.airport))fail(400,'Choose an airport from the directory.');
  return {airport:value.airport,name:text(value.name,80)||value.airport,view:['tower','overhead'].includes(value.view)?value.view:'tower',settings:validateLibrary('views',{settings:value.settings??{}}).settings};
 }
 if(kind==='missions'){
  if(!Object.hasOwn(airports,value.from)||!Object.hasOwn(airports,value.to)||(value.from===value.to&&value.lesson!=='pattern')||!['easy','advanced'].includes(value.difficulty)||!['landed','crashed','aborted'].includes(value.result)||!Number.isFinite(value.duration)||value.duration<0||value.duration>86400||!Number.isFinite(value.touchdownRate)||Math.abs(value.touchdownRate)>20000)fail(400,'Invalid simulator result.');
  const outcome={practiceReset:value.practiceReset===true};
  if(value.replay!==undefined)outcome.replay=validateReplay(value.replay);
  if(value.lesson!==undefined){if(!['free','takeoff','pattern','crosswind','glide'].includes(value.lesson))fail(400,'Invalid training lesson.');outcome.lesson=value.lesson;outcome.lessonCompleted=value.lessonCompleted===true&&!outcome.practiceReset;}
  if(value.touchdownScore!==undefined){if(!Number.isInteger(value.touchdownScore)||value.touchdownScore<0||value.touchdownScore>100)fail(400,'Invalid touchdown score.');outcome.touchdownScore=value.touchdownScore;}
  if(value.occupants!==undefined||value.fatalities!==undefined){if(!Number.isInteger(value.occupants)||value.occupants<1||value.occupants>194||!Number.isInteger(value.fatalities)||value.fatalities<0||value.fatalities>value.occupants||(value.result!=='crashed'&&value.fatalities!==0))fail(400,'Invalid fictional occupant outcome.');outcome.occupants=value.occupants;outcome.fatalities=value.fatalities;}
  if(value.fuelRemainingKg!==undefined){if(!Number.isFinite(value.fuelRemainingKg)||value.fuelRemainingKg<0||value.fuelRemainingKg>20000)fail(400,'Invalid fuel remaining.');outcome.fuelRemainingKg=Math.round(value.fuelRemainingKg*10)/10;outcome.fuelExhausted=value.fuelExhausted===true;}
  return {...outcome,from:value.from,to:value.to,difficulty:value.difficulty,result:value.result,duration:Math.round(value.duration),touchdownRate:Math.round(value.touchdownRate),aircraftType:text(value.aircraftType,16),assisted:value.assisted===true,challenge:text(value.challenge,30),completedAt:Date.now(),source:'Personal simulation result; not verified real flying'};
 }
 if(kind==='simulator'){
  if(value.kind!=='career'||!Number.isInteger(value.version)||!value.career||typeof value.career!=='object')fail(400,'Upload an airport career save.');
  return value; // Godot performs full version/scenario validation before restoring.
 }
 fail(400,'Unknown library.');
}
export function createAccountLibrary(db,{now,entitlement}){
 db.exec('CREATE TABLE IF NOT EXISTS account_library(user_id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,kind,key)); CREATE TABLE IF NOT EXISTS alert_reads(user_id TEXT PRIMARY KEY,through_id INTEGER NOT NULL);');
 const get=(sql,...args)=>db.prepare(sql).get(...args);
 return async function library(path,method,u,url,b,send){
  if(path==='/api/account/alerts'&&method==='POST'){
   if(!Number.isSafeInteger(b.throughId)||b.throughId<0)fail(400,'Invalid alert cursor.');
   const max=get('SELECT COALESCE(MAX(id),0) n FROM alerts WHERE user_id=?',u.id).n;
   db.prepare('INSERT INTO alert_reads VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET through_id=MAX(through_id,excluded.through_id)').run(u.id,Math.min(max,b.throughId));
   send(200,{ok:true});return true;
  }
  if(path==='/api/account/dashboard'&&method==='GET'){
   const read=get('SELECT through_id FROM alert_reads WHERE user_id=?',u.id)?.through_id??0;
   const rows=db.prepare('SELECT journeys.key,journeys.body,checks.body AS detail FROM journeys LEFT JOIN checks ON checks.user_id=journeys.user_id AND checks.key=journeys.key WHERE journeys.user_id=? ORDER BY journeys.key').all(u.id);
   send(200,{journeys:rows.map(r=>({...JSON.parse(r.body),details:r.detail?JSON.parse(r.detail):null})),alerts:db.prepare('SELECT id,message,created FROM alerts WHERE user_id=? ORDER BY id DESC LIMIT 50').all(u.id).map(a=>({...a,read:a.id<=read})),counts:db.prepare('SELECT kind,COUNT(*) count FROM account_library WHERE user_id=? GROUP BY kind').all(u.id)});
   return true;
  }
  if(path!=='/api/account/library')return false;
  const kind=method==='GET'?url.searchParams.get('kind'):b.kind,limit=Object.hasOwn(LIBRARY_LIMITS,kind)?LIBRARY_LIMITS[kind]:null;if(!limit)fail(400,'Unknown library.');
  if(!limit.free&&!await entitlement(u))fail(403,'Premium is required for this library.');
  if(method==='GET'){
   const key=url.searchParams.get('key');
   if(key){const row=get('SELECT key,body,revision,updated FROM account_library WHERE user_id=? AND kind=? AND key=?',u.id,kind,key);if(!row)fail(404,'Saved item not found.');send(200,{...row,value:JSON.parse(row.body),body:undefined});}
   else send(200,{items:db.prepare('SELECT key,body,revision,updated FROM account_library WHERE user_id=? AND kind=? ORDER BY updated DESC').all(u.id,kind).map(({body,...r})=>{const v=JSON.parse(body);return {...r,value:['recordings','simulator'].includes(kind)?undefined:librarySummary(kind,v),name:v.name??v.career?.airport_name??v.callsign??kind,bytes:Buffer.byteLength(body)};}),limits:limit});
   return true;
  }
  if(method!=='POST')fail(405,'Method not allowed.');
  const key=text(b.key,120);if(!key||!/^[a-zA-Z0-9._:-]+$/.test(key))fail(400,'Invalid item key.');
  db.exec('BEGIN IMMEDIATE');
  try{
  const old=get('SELECT revision FROM account_library WHERE user_id=? AND kind=? AND key=?',u.id,kind,key);
  if(!limit.free&&b.revision!==(old?.revision??0))fail(409,'This item changed on another device. Refresh before saving.');
  if(b.remove===true){db.prepare('DELETE FROM account_library WHERE user_id=? AND kind=? AND key=?').run(u.id,kind,key);db.exec('COMMIT');send(200,{ok:true});return true;}
  const value=validateLibrary(kind,b.value),body=JSON.stringify(value);
  if(kind==='watchlist'&&key!==value.hex)fail(400,'Watch key must match its aircraft.');
  if(Buffer.byteLength(body)>limit.bytes)fail(413,'Saved item exceeds its storage limit.');
  if(!old&&get('SELECT COUNT(*) n FROM account_library WHERE user_id=? AND kind=?',u.id,kind).n>=limit.count)fail(429,'Library is full. Remove an item before adding another.');
  const revision=(old?.revision??0)+1;
  db.prepare('INSERT INTO account_library VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,kind,key) DO UPDATE SET body=excluded.body,revision=excluded.revision,updated=excluded.updated').run(u.id,kind,key,body,revision,now());
  db.exec('COMMIT');send(200,{ok:true,key,revision});return true;
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
 };
}
