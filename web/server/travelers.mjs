import {randomBytes} from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createTravelers({store,entitlement,userById,readJourney,observations=()=>[],now=Date.now}){
 const rates=new Map();
 async function project(record){
  if(!record||record.value.expires<=now())return null;
  const user=await userById(record.userId);if(!user||!await entitlement(user))return null;
  const j=await readJourney(record.userId,record.value.journeyKey);if(!j)return null;
  // Same-day callsign match only. Neither this nor a barcode proves the person is aboard.
  const matches=j.date===new Date(now()).toISOString().slice(0,10)?observations().filter(a=>!a.simulation&&a.targetKind==='aircraft'&&a.callsign?.trim()===j.callsign&&(!j.hex||j.hex===a.hex)&&/^[a-f0-9]{6}$/i.test(a.hex)&&Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Number.isFinite(a.observedAt)&&now()-a.observedAt>=-5000&&now()-a.observedAt<120000&&!a.positionWarning):[];
  const a=matches.length===1?matches[0]:null;
  return {id:record.key,alias:record.value.alias,side:record.value.side,position:record.value.position,expires:record.value.expires,callsign:j.callsign,date:j.date,from:j.from||'',to:j.to||'',hex:a?.hex||null,observedAt:a?.observedAt||null,status:a?'Recent matching aircraft observation':'Aircraft not currently matched',url:'/?traveler='+record.key};
 }
 async function handle(path,method,u,b){
  if(path!=='/api/premium/travelers')return null;
  if(method==='GET')return {items:(await store.list(u.id,'traveler')).filter(r=>r.value.expires>now()).map(r=>({key:r.key,...r.value}))};
  if(method!=='POST')fail(405,'Method not allowed.');
  if(b.remove===true){await store.drop(u.id,'traveler',String(b.key||''));return {ok:true};}
  if(!await entitlement(u))fail(403,'Premium is required to publish a shared trip.');
  if(b.consent!==true)fail(400,'Confirm public sharing of your own trip.');
  const alias=typeof b.alias==='string'?b.alias.trim():'';
  if(!alias||alias.length>40||/[<>\u0000-\u001f\u007f]/.test(alias)||!['left','right'].includes(b.side)||!['front','wing','rear'].includes(b.position)||![1,24].includes(b.hours))fail(400,'Choose a display name, window view and sharing duration.');
  const j=await readJourney(u.id,String(b.journeyKey||''));if(!j)fail(404,'Link your saved tracking journey first.');
  const date=Date.parse(j.date);if(!Number.isFinite(date)||date<now()-2*86400000||date>now()+7*86400000)fail(400,'Share a current trip or one departing within seven days.');
  for(const r of await store.list(u.id,'traveler'))if(r.value.expires<=now())await store.drop(u.id,'traveler',r.key);
  const key=randomBytes(16).toString('hex'),value={alias,side:b.side,position:b.position,journeyKey:j.key,expires:now()+b.hours*3600000};
  await store.put(u.id,'traveler',key,value,3);return {key,...value,url:'/?traveler='+key};
 }
 async function publicHandle(req,res,url){
  const directory=url.pathname==='/travelers'||url.pathname==='/travelers/',api=url.pathname.startsWith('/api/travelers/');if(!directory&&!api)return false;
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
  let status=200,body,type=api?'application/json':'text/html; charset=utf-8';
  try{
   if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed.');
   const ip=req.socket.remoteAddress||'local',rate=rates.get(ip);if(rate&&now()-rate.start<60000&&rate.count>=60)fail(429,'Please wait before refreshing.');
   rates.set(ip,rate&&now()-rate.start<60000?{...rate,count:rate.count+1}:{start:now(),count:1});if(rates.size>1000)rates.delete(rates.keys().next().value);
   if(api){const key=url.pathname.slice('/api/travelers/'.length);if(!/^[a-f0-9]{32}$/.test(key))fail(404,'This shared trip is unavailable.');const r=await store.find('traveler',key),item=await project(r?{...r,key}:null);if(!item)fail(404,'This shared trip expired or was withdrawn.');body=JSON.stringify(item);}
   else{
    const records=(await store.scan('traveler')).filter(r=>r.value.expires>now()).slice(0,50),items=[];
    for(const r of records){const item=await project(r);if(item)items.push(item);}
    const flight=(url.searchParams.get('flight')||'').trim().toUpperCase().slice(0,10),shown=flight?items.filter(p=>p.callsign===flight):items;
    const cards=shown.map(p=>`<article><span class="eyebrow">SHARED BY A TRAVELER</span><h2>${esc(p.alias)}’s journey</h2><strong>${esc(p.from||'?')} → ${esc(p.to||'?')}</strong><p>${esc(p.callsign)} · ${esc(p.date)}</p><p class="muted">${esc(p.status)}<br>Window view: ${esc(p.side)} · ${esc(p.position==='front'?'ahead of wing':p.position==='rear'?'behind wing':'over wing')}</p><a class="button" href="${esc(p.url)}">${p.hex?'Watch from '+esc(p.alias)+'’s window':'View shared trip'} →</a></article>`).join('');
    body=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Travel together · Skyward</title><style>body{margin:0;background:#081820;color:#eef8f5;font:17px/1.6 system-ui}main,nav{max-width:1100px;margin:auto;padding:24px}nav{display:flex;justify-content:space-between}a{color:#b4f3dc}h1{font-size:clamp(36px,6vw,68px);line-height:1.1;max-width:780px}input{max-width:100%;box-sizing:border-box;background:#102b37;color:#eef8f5;border:1px solid #527b7f;padding:12px;border-radius:9px}button{border:0;cursor:pointer}h2{font-size:25px;overflow-wrap:anywhere}.intro{max-width:720px}.eyebrow{letter-spacing:.15em;color:#b4f3dc;font-size:12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:20px;margin:36px 0}article,.invite{border:1px solid #395560;border-radius:18px;padding:24px;background:#102b37}.button{display:inline-block;background:#b4f3dc;color:#102330;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:650}.muted{color:#b1c9cc;font-size:14px}.invite{background:linear-gradient(120deg,#153c42,#18273e)}footer{margin:30px 0}</style><nav><a href="/">← Skyward globe</a><a href="/?account=upgrade">Explore Premium</a></nav><main><span class="eyebrow">TRAVEL TOGETHER</span><h1>A window into someone’s journey.</h1><p class="intro">Follow a flight shared by its traveler, explore the route, and enjoy a simulated view from their chosen window position. No account needed to watch.</p><p class="muted intro">Only people who choose to publish appear here. Trips are self-reported; presence onboard is not verified. Window views use Skyward’s scenery and available aircraft observations, not a camera or an exact seat map.</p><form action="/travelers/" method="get"><label>Find a tracking callsign <input name="flight" maxlength="10" value="${esc(flight)}" placeholder="THY111"></label> <button class="button">Find travelers</button> <a href="/travelers/">Show all</a></form><p class="muted">Up to 50 active shared journeys${flight?` · filtered by ${esc(flight)}`:''}.</p><section class="cards" aria-label="Shared travelers">${cards||'<article><h2>The next journey could be yours.</h2><p>No travelers are sharing in this view right now. Shared trips appear here for up to 24 hours.</p></article>'}</section><section class="invite"><span class="eyebrow">SKYWARD PREMIUM</span><h2>Bring someone along for your journey.</h2><p>Scan your boarding pass or enter your flight yourself. Save it privately, then choose whether to invite the world to follow along.</p><a class="button" href="/?account=upgrade">Discover your travel companion →</a></section><footer class="muted">Travelers can withdraw sharing at any time. No booking references, boarding barcodes, account emails or exact seat numbers are published.</footer></main></html>`;
   }
  }catch(e){status=e.status||503;const message=e.status?e.message:'Shared trips are temporarily unavailable.';body=api?JSON.stringify({error:message}):`<!doctype html><html><title>Skyward travelers</title><p>${esc(message)}</p><a href="/">Back to globe</a></html>`;}
  res.writeHead(status,{...headers,'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);return true;
 }
 async function tick(){for(const r of await store.scan('traveler'))if(r.value.expires<=now())await store.drop(r.userId,'traveler',r.key);}
 return {handle,publicHandle,tick};
}
