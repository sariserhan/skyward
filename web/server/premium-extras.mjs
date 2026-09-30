import {createPremiumHome} from './premium-home.mjs';
import {randomBytes,createHash} from 'node:crypto';
import airports from '../data/airport-catalog.json' with {type:'json'};
import {parseCamera} from '../src/lib/sharedCamera.ts';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const hash=s=>createHash('sha256').update(s).digest('hex');
const text=(v,n=80)=>typeof v==='string'?v.trim().slice(0,n):'';
const verified=d=>d?.mode==='live'&&['MATCHED_RECENT_AIRCRAFT','MATCHED_DATED_FLIGHT'].includes(d.status);
const distance=(a,b)=>{const r=Math.PI/180,s=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 6880.13*Math.asin(Math.min(1,Math.sqrt(s)));};
export function spotterMatches(rule,a,previous,now){
 if(a.simulation||a.targetKind!=='aircraft'||!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||!Number.isFinite(a.observedAt)||now-a.observedAt>120000||now-a.observedAt< -5000||!/^[a-f0-9]{6}$/i.test(a.hex))return false;
 const d=distance(a,airports[rule.airport]);if(d>rule.radius)return false;
 if(rule.type&&a.aircraftType?.toUpperCase()!==rule.type)return false;
 if(rule.registration&&a.registration?.toUpperCase()!==rule.registration)return false;
 if(rule.airline&&!a.callsign?.toUpperCase().startsWith(rule.airline))return false;
 if(rule.phase==='ground'&&!a.ground)return false;
 if(rule.phase==='approach'&&(a.ground||!previous||a.observedAt<=previous.time||a.observedAt-previous.time>120000||previous.distance-d<.05||!Number.isFinite(a.altitude)||a.altitude>=previous.altitude))return false;
 return true;
}
export function inboundEvidence(journey,journeys){
 const d=journey?.details,f=verified(d)?d.flight:null;
 if(!f?.hex||!f.departure?.airport||!Number.isFinite(f.departure.scheduledAt))return {available:false,message:'No verified aircraft assignment is available for this flight.'};
 const candidates=journeys.filter(j=>j.key!==journey.key&&verified(j.details)).map(j=>j.details.flight).filter(p=>p?.hex===f.hex&&p.callsign!==f.callsign&&p.arrival?.airport===f.departure.airport&&Number.isFinite(p.arrival.scheduledAt)&&p.arrival.scheduledAt<=f.departure.scheduledAt&&f.departure.scheduledAt-p.arrival.scheduledAt<86400000).sort((a,b)=>b.arrival.scheduledAt-a.arrival.scheduledAt);
 const p=candidates[0];if(!p)return {available:false,hex:f.hex,message:'Aircraft assigned, but no matching preceding flight is available in your verified journeys.'};
 const arrival=p.arrival.actualAt??p.arrival.estimatedAt??p.arrival.scheduledAt;
 return {available:true,hex:f.hex,flight:p,lateInbound:arrival>f.departure.scheduledAt,message:'Possible preceding leg: same assigned aircraft and connecting airport in your verified journeys. Aircraft swaps and missing intervening legs remain possible; this is not a delay prediction.'};
}
export function createPremiumExtras({store,entitlement,userById,readJourney,listJourneys=async()=>[],observations=()=>[],notifyVerified,now=Date.now,env=process.env}){
 const home=createPremiumHome({store,listJourneys,observations,now});
 const rooms=new Map(),rates=new Map();
 function sweep(){for(const [k,r]of rooms)if(r.expires<=now())rooms.delete(k);for(const [k,v]of rates)if(v<now())rates.delete(k);}
 function limited(key,ms){sweep();if((rates.get(key)||0)>now())fail(429,'Please wait before updating again.');if(rates.size>=2000)fail(503,'Watch rooms are busy. Try again shortly.');rates.set(key,now()+ms);}
 const roomPublic=r=>({expires:r.expires,updatedAt:r.updatedAt,state:r.state,reactions:r.reactions});
 async function handle(path,method,u,b){
  if(!['/api/premium/home','/api/premium/preferences','/api/premium/family','/api/premium/spotter','/api/premium/spotter/check','/api/premium/inbound','/api/premium/rooms'].includes(path))return null;
  const kind=path.endsWith('/family')?'family':'spotter';
  if(b.remove===true&&['/api/premium/family','/api/premium/spotter'].includes(path)){await store.drop(u.id,kind,text(b.key,120));if(kind==='spotter')await store.drop(u.id,'spotter-state',text(b.key,120));return {ok:true};}
  if(path==='/api/premium/rooms'&&b.remove===true){const key=text(b.key,64),r=rooms.get(key);if(!r||r.userId!==u.id)fail(404,'Room expired or unavailable.');rooms.delete(key);return {ok:true};}
  if(!await entitlement(u))fail(403,'Premium is required for this feature.');
  const homeResult=await home(path,method,u,b);if(homeResult)return homeResult;
  if(path==='/api/premium/inbound'){const j=await readJourney(u.id,text(b.key,120));if(!j)fail(404,'Save this journey first.');return inboundEvidence(j,await listJourneys(u.id));}
  if(path==='/api/premium/rooms'){
   sweep();if(method==='GET')return {items:[...rooms].filter(([,r])=>r.userId===u.id).map(([key,r])=>({key,...roomPublic(r)})),limit:2};
   if(b.create){if(rooms.size>=100||[...rooms.values()].filter(r=>r.userId===u.id).length>=2)fail(429,'Close an existing room before creating another.');const token=randomBytes(32).toString('hex'),key=hash(token),r={userId:u.id,expires:now()+2*3600000,updatedAt:now(),state:{hex:null,camera:null},reactions:[]};rooms.set(key,r);return {key,url:'/?room='+token,hostUrl:'/?hostRoom='+key,...roomPublic(r)};}
   const key=text(b.key,64),r=rooms.get(key);if(!r||r.userId!==u.id)fail(404,'Room expired or unavailable.');
   if(b.remove){rooms.delete(key);return {ok:true};}
   limited('host:'+key,3000);
   const hex=b.hex===null?null:text(b.hex,6).toLowerCase();if(hex!==null&&!/^[a-f0-9]{6}$/.test(hex))fail(400,'Select a real aircraft.');
   const camera=b.camera===null?null:parseCamera(text(b.camera,200));if(b.camera!==null&&!camera)fail(400,'Invalid camera.');
   r.state={hex,camera};r.updatedAt=now();return roomPublic(r);
  }
  if(path.endsWith('/check')){limited('spotter:'+u.id,30000);await checkSpotter(u.id);return {items:await store.list(u.id,'spotter-hit'),message:'Checked recent observations already received by this server. No extra tracking request was made.'};}
  if(method==='GET')return {items:await store.list(u.id,kind),...(kind==='spotter'?{events:await store.list(u.id,'spotter-hit')}:{}),limit:kind==='family'?10:10};
  const key=text(b.key,120)||randomBytes(12).toString('hex');if(!/^[\w:-]+$/.test(key))fail(400,'Invalid item identifier.');
  if(kind==='family'){
   const j=await readJourney(u.id,text(b.journeyKey,120));if(!j)fail(404,'Save this journey first.');
   const label=text(b.label,40);if(!label)fail(400,'Enter a display label, such as Family trip.');
   await store.put(u.id,kind,key,{label,journeyKey:j.key},10);
  }else{
   const airport=text(b.airport,4).toUpperCase(),type=text(b.type,8).toUpperCase(),registration=text(b.registration,16).toUpperCase(),airline=text(b.airline,3).toUpperCase();
   if(!Object.hasOwn(airports,airport)||!['any','approach','ground'].includes(b.phase)||![10,25,50].includes(b.radius)||!type&&!registration&&!airline||type&&!/^[A-Z0-9]{2,8}$/.test(type)||registration&&!/^[A-Z0-9-]{2,16}$/.test(registration)||airline&&!/^[A-Z]{3}$/.test(airline))fail(400,'Choose an airport, radius and aircraft type, registration or three-letter airline code.');
   await store.put(u.id,kind,key,{airport,type,registration,airline,phase:b.phase,radius:b.radius},10);
  }
  return {ok:true,key};
 }
 async function checkSpotter(userId){
  const rows=observations().slice(0,5000);
  for(const r of await store.list(userId,'spotter')){
   const prior=await store.get(userId,'spotter-state',r.key)??{},next={};
   for(const a of rows){
    if(!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||!Number.isFinite(a.observedAt)||now()-a.observedAt>120000||a.simulation)continue;
    const d=distance(a,airports[r.value.airport]);if(d>r.value.radius||Object.keys(next).length>=32)continue;
    const p=prior[a.hex];let alerted=p?.alerted??0;
    if(spotterMatches(r.value,a,p,now())&&(!alerted||now()-alerted>6*3600000)){
     const message=`${a.callsign||a.registration||a.hex}: ${r.value.phase==='approach'?'moving closer and descending near':'observed near'} ${r.value.airport} · ${a.aircraftType||'type unknown'}`;
     const hits=await store.list(userId,'spotter-hit');if(hits.length>=30)await store.drop(userId,'spotter-hit',hits.sort((a,b)=>a.value.time-b.value.time)[0].key);
     const id=hash(`${r.key}:${a.hex}:${a.observedAt}`);await store.put(userId,'spotter-hit',id,{message,hex:a.hex,time:a.observedAt},30);await notifyVerified(userId,id,message);alerted=now();
    }
    next[a.hex]={distance:d,altitude:a.altitude,time:a.observedAt,alerted};
   }
   // Preserve deduplication when coverage disappears, but expire within one day.
   for(const [hex,p]of Object.entries(prior))if(!next[hex]&&now()-p.time<86400000&&Object.keys(next).length<32)next[hex]=p;
   if(JSON.stringify(prior)!==JSON.stringify(next))await store.put(userId,'spotter-state',r.key,next,10);
  }
 }
 async function tick(){const users=new Set((await store.scan('spotter')).map(r=>r.userId));for(const id of users){if(!await store.claim('spotter-tick:'+id,now(),60000))continue;const u=await userById(id);if(u&&await entitlement(u))await checkSpotter(id);}sweep();}
 async function publicHandle(req,res,url){
  if(!url.pathname.startsWith('/api/watch-room/'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'});res.end(JSON.stringify(data));};
  try{
   const token=url.pathname.slice('/api/watch-room/'.length);if(!/^[a-f0-9]{64}$/.test(token))fail(404,'Room unavailable.');sweep();const r=rooms.get(hash(token));if(!r)fail(404,'This room ended or expired.');
   limited('guest:'+hash(token)+':'+(req.socket.remoteAddress||''),1000);
   const u=await userById(r.userId);if(!u||!await entitlement(u)){rooms.delete(hash(token));fail(404,'This room ended.');}
   if(req.method==='POST'){
    if(req.headers.origin!==(env.SKYWARD_PUBLIC_ORIGIN||'http://localhost:8000')||!String(req.headers['content-type']).startsWith('application/json'))fail(403,'Use this site to react.');
    const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>512)fail(413,'Request too large.');chunks.push(c);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Invalid reaction.');}
    if(!['wave','love','plane'].includes(body.reaction))fail(400,'Choose a reaction.');r.reactions=[...r.reactions,{reaction:body.reaction,time:now()}].slice(-12);
   }else if(req.method!=='GET')fail(405,'Method not allowed.');
   send(200,roomPublic(r));
  }catch(e){send(e.status||500,{error:e.status?e.message:'Room temporarily unavailable.'});}return true;
 }
 return {handle,publicHandle,tick};
}
