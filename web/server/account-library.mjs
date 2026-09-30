import airframeSource from '../data/airframe-catalog.json' with {type:'json'};
import {normalizedFollows,publishedCatalog} from '../src/lib/airframeCatalog.ts';
const airframeCatalog=publishedCatalog(airframeSource);
import {librarySummary} from './simulator-replay.mjs';
import {validBackupValue} from '../src/lib/localBackup.ts';
import {ACCOUNT_LIBRARY_LIMITS,ACCOUNT_LIBRARY_BYTES,careerProgress} from '../src/lib/accountStoragePolicy.ts';
import airports from '../data/airport-catalog.json' with {type:'json'};
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const text=(v,n=100)=>typeof v==='string'?v.trim().slice(0,n):'';
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const LIBRARY_LIMITS=ACCOUNT_LIBRARY_LIMITS;
export {ACCOUNT_LIBRARY_BYTES};
const setupKeys=new Set(['skyward.map.v1','skyward.flight-view.v1','skyward.camera-bookmarks.v1','skyward.favorites.v1','skyward.cabin-audio.v1']);
export function validateLibrary(kind,value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Choose a valid saved item.');
 if(kind==='boardingpasses'){
  const displayName=text(value.displayName,40),flight=text(value.flight,10).toUpperCase(),from=text(value.from,3).toUpperCase(),to=text(value.to,3).toUpperCase(),seat=text(value.seat,6).toUpperCase(),callsign=text(value.callsign,10).toUpperCase(),journeyKey=text(value.journeyKey,120);
  if(!displayName||/[\x00-\x1f\x7f]/.test(displayName)||!date(value.date)||! /^(?:[A-Z0-9]{2}|[A-Z]{3})[0-9]{1,4}[A-Z]?$/.test(flight)||! /^[A-Z]{3}$/.test(from)||! /^[A-Z]{3}$/.test(to)||from===to||seat&&! /^[A-Z0-9-]{1,6}$/.test(seat)||callsign&&! /^[A-Z]{3}[A-Z0-9]{1,7}$/.test(callsign)||journeyKey&&! /^[A-Z0-9]+:(?:[a-f0-9]{6}|unassigned):\d{4}-\d{2}-\d{2}$/.test(journeyKey))fail(400,'Enter a name or display name, flight, date, two airport codes and a valid seat.');
  // Explicit allowlist: raw barcode, images, PNR, full scanned name, ticket and sequence never persist.
  return {displayName,flight,from,to,seat,date:value.date,callsign,journeyKey};
 }
 if(kind==='aircraftfollows'){try{return {ids:normalizedFollows(airframeCatalog,value.ids)};}catch(e){fail(400,e.message);}}
 if(kind==='watchlist'){
  if(!/^[a-f0-9]{6}$/.test(value.hex))fail(400,'Invalid aircraft identifier.');
  return {hex:value.hex,callsign:text(value.callsign,16),registration:text(value.registration,32),aircraftType:text(value.aircraftType,16)};
 }
 if(kind==='views'){
  const settings={};for(const [key,v] of Object.entries(value.settings??{})){if(!setupKeys.has(key)||typeof v!=='string'||v.length>50000)fail(400,'Invalid viewing setting.');if(key==='skyward.cabin-audio.v1'?!['on','off'].includes(v):!validBackupValue(key,v))fail(400,'Invalid viewing settings.');settings[key]=v;}
  return {name:text(value.name,80)||'My viewing setup',settings};
 }
 if(kind==='recordings')fail(413,'Full recordings stay on this device. Save in the browser or export a file.');
 if(kind==='logbook'){
  const from=text(value.from,4).toUpperCase(),to=text(value.to,4).toUpperCase();
  if(!date(value.date)||!Object.hasOwn(airports,from)||!Object.hasOwn(airports,to)||from===to)fail(400,'Choose a date and two different airports from the directory.');
  if(!Number.isFinite(value.durationMinutes)||value.durationMinutes<0||value.durationMinutes>1500)fail(400,'Duration must be between 0 and 1,500 minutes.');
  if(value.experience!==undefined&&!['flown','watched'].includes(value.experience))fail(400,'Choose flown or watched.');
  return {experience:value.experience??'flown',date:value.date,from,to,callsign:text(value.callsign,16),aircraftType:text(value.aircraftType,20),registration:text(value.registration,32),durationMinutes:Math.round(value.durationMinutes),notes:text(value.notes,500)};
 }
 if(kind==='trips'){
  if(!Array.isArray(value.legs)||!value.legs.length||value.legs.length>12)fail(400,'A trip needs 1–12 legs.');
  const legs=value.legs.map(l=>{if(!l||!Object.hasOwn(airports,l.from)||!Object.hasOwn(airports,l.to)||l.from===l.to||!Number.isFinite(l.departureAt)||!Number.isFinite(l.arrivalAt)||l.arrivalAt<=l.departureAt||l.arrivalAt-l.departureAt>48*3600000||l.departureAt<0||l.arrivalAt>8640000000000000)fail(400,'Use valid airports and UTC times for every leg.');return {from:l.from,to:l.to,callsign:text(l.callsign,16),journeyKey:text(l.journeyKey,100),departureAt:l.departureAt,arrivalAt:l.arrivalAt};});
  for(let i=1;i<legs.length;i++)if(legs[i].departureAt<legs[i-1].arrivalAt||legs[i].from!==legs[i-1].to)fail(400,'Connect legs at the same airport in chronological order.');
  return {name:text(value.name,80)||'My trip',legs};
 }
 if(kind==='journal'){
  if(!date(value.date)||!Object.hasOwn(airports,value.airport))fail(400,'Choose a sighting date and airport.');
  const photo=typeof value.photo==='string'?value.photo:'';if(photo)fail(413,'Photos stay outside account storage. Save this sighting without a photo.');
  return {date:value.date,airport:value.airport,callsign:text(value.callsign,16),registration:text(value.registration,32),aircraftType:text(value.aircraftType,20),airline:text(value.airline,80),notes:text(value.notes,1000),collection:text(value.collection,50),photo};
 }
 if(kind==='airports'){
  if(!Object.hasOwn(airports,value.airport))fail(400,'Choose an airport from the directory.');
  return {airport:value.airport,name:text(value.name,80)||value.airport,view:['tower','overhead'].includes(value.view)?value.view:'tower',settings:validateLibrary('views',{settings:value.settings??{}}).settings};
 }
 if(kind==='missions'){
  if(!Object.hasOwn(airports,value.from)||!Object.hasOwn(airports,value.to)||(value.from===value.to&&value.lesson!=='pattern')||!['easy','advanced'].includes(value.difficulty)||!['landed','crashed','aborted'].includes(value.result)||!Number.isFinite(value.duration)||value.duration<0||value.duration>86400||!Number.isFinite(value.touchdownRate)||Math.abs(value.touchdownRate)>20000)fail(400,'Invalid simulator result.');
  const outcome={practiceReset:value.practiceReset===true};
  // Full replay samples remain local; only the allowlisted outcome is stored.
  if(value.lesson!==undefined){if(!['free','takeoff','pattern','crosswind','glide'].includes(value.lesson))fail(400,'Invalid training lesson.');outcome.lesson=value.lesson;outcome.lessonCompleted=value.lessonCompleted===true&&!outcome.practiceReset;}
  if(value.touchdownScore!==undefined){if(!Number.isInteger(value.touchdownScore)||value.touchdownScore<0||value.touchdownScore>100)fail(400,'Invalid touchdown score.');outcome.touchdownScore=value.touchdownScore;}
  if(value.occupants!==undefined||value.fatalities!==undefined){if(!Number.isInteger(value.occupants)||value.occupants<1||value.occupants>194||!Number.isInteger(value.fatalities)||value.fatalities<0||value.fatalities>value.occupants||(value.result!=='crashed'&&value.fatalities!==0))fail(400,'Invalid fictional occupant outcome.');outcome.occupants=value.occupants;outcome.fatalities=value.fatalities;}
  if(value.fuelRemainingKg!==undefined){if(!Number.isFinite(value.fuelRemainingKg)||value.fuelRemainingKg<0||value.fuelRemainingKg>20000)fail(400,'Invalid fuel remaining.');outcome.fuelRemainingKg=Math.round(value.fuelRemainingKg*10)/10;outcome.fuelExhausted=value.fuelExhausted===true;}
  return {...outcome,from:value.from,to:value.to,difficulty:value.difficulty,result:value.result,duration:Math.round(value.duration),touchdownRate:Math.round(value.touchdownRate),aircraftType:text(value.aircraftType,16),assisted:value.assisted===true,challenge:text(value.challenge,30),completedAt:Date.now(),source:'Personal simulation result; not verified real flying'};
 }
 if(kind==='simulator'){try{return careerProgress(value);}catch(e){fail(400,e.message);}}
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
  if((!limit.free||(method==='POST'&&b.remove!==true))&&!await entitlement(u))fail(403,'Premium is required to save and sync account data.');
  if(method==='GET'){
   const key=url.searchParams.get('key');
   if(key){const row=get('SELECT key,body,revision,updated FROM account_library WHERE user_id=? AND kind=? AND key=?',u.id,kind,key);if(!row)fail(404,'Saved item not found.');send(200,{...row,value:JSON.parse(row.body),body:undefined});}
   else send(200,{items:db.prepare('SELECT key,body,revision,updated FROM account_library WHERE user_id=? AND kind=? ORDER BY updated DESC').all(u.id,kind).map(({body,...r})=>{const v=JSON.parse(body);return {...r,value:kind==='recordings'||(kind==='simulator'&&v.kind==='career')?undefined:librarySummary(kind,v),name:v.name??v.airport_name??v.career?.airport_name??v.callsign??kind,bytes:Buffer.byteLength(body)};}),limits:limit});
   return true;
  }
  if(method!=='POST')fail(405,'Method not allowed.');
  const key=text(b.key,120);if(!key||!/^[a-zA-Z0-9._:-]+$/.test(key))fail(400,'Invalid item key.');
  db.exec('BEGIN IMMEDIATE');
  try{
  const old=get('SELECT revision,body FROM account_library WHERE user_id=? AND kind=? AND key=?',u.id,kind,key);
  if((!limit.free||kind==='boardingpasses')&&b.revision!==(old?.revision??0))fail(409,'This item changed on another device. Refresh before saving.');
  if(b.remove===true){db.prepare('DELETE FROM account_library WHERE user_id=? AND kind=? AND key=?').run(u.id,kind,key);db.exec('COMMIT');send(200,{ok:true});return true;}
  const value=validateLibrary(kind,b.value),body=JSON.stringify(value);
  if(kind==='boardingpasses'&&value.journeyKey){const saved=get('SELECT body FROM journeys WHERE user_id=? AND key=?',u.id,value.journeyKey);const j=saved?JSON.parse(saved.body):null;if(!j||j.date!==value.date||j.from&&j.from!==value.from||j.to&&j.to!==value.to||j.callsign!==value.callsign)fail(400,'Link a matching journey from your own account.');}
  if(kind==='aircraftfollows'&&key!=='airframes')fail(400,'Use the canonical airframes list.');if(kind==='watchlist'&&key!==value.hex)fail(400,'Watch key must match its aircraft.');
  if(Buffer.byteLength(body)>limit.bytes)fail(413,'Saved item exceeds its storage limit.');
  if(!old&&get('SELECT COUNT(*) n FROM account_library WHERE user_id=? AND kind=?',u.id,kind).n>=limit.count)fail(429,'Library is full. Remove an item before adding another.');
  if(old?.body===body){db.exec('COMMIT');send(200,{ok:true,key,revision:old.revision,unchanged:true});return true;}
  const used=get('SELECT COALESCE(SUM(length(CAST(body AS BLOB))),0) bytes FROM account_library WHERE user_id=?',u.id).bytes;
  if(used-(old?Buffer.byteLength(old.body):0)+Buffer.byteLength(body)>ACCOUNT_LIBRARY_BYTES&&(!old||Buffer.byteLength(body)>Buffer.byteLength(old.body)))fail(413,'Account storage is full (512 KB). Remove saved items or export a local backup.');
  const revision=(old?.revision??0)+1;
  db.prepare('INSERT INTO account_library VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,kind,key) DO UPDATE SET body=excluded.body,revision=excluded.revision,updated=excluded.updated').run(u.id,kind,key,body,revision,now());
  db.exec('COMMIT');send(200,{ok:true,key,revision});return true;
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
 };
}
