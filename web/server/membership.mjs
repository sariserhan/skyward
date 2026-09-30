import {developmentPremium} from './development-premium.mjs';
import {sqlitePremiumStore} from './premium-store.mjs';
import {createPremiumTools} from './premium-tools.mjs';
import {createAccountLibrary} from './account-library.mjs';
import airports from '../data/airport-catalog.json' with {type:'json'};
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {airlabsPreview, flightCode} from './airlabs.mjs';
const scrypt=promisify(scryptCallback);
const passwordHash=(password,salt)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,message)=>{throw Object.assign(new Error(message),{status:code});};
const integer=(value,fallback)=>{const n=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid premium limit');return n;};
const customerId=value=>typeof value==='string'?value:value?.id;

export {changesSince} from './flight-alerts.mjs';
import {changesSince} from './flight-alerts.mjs';

export function createMembership({env=process.env, fetchImpl=fetch, now=Date.now, observations=()=>[], dbPath}={}) {
  if(env.NODE_ENV==='production'&&env.SKYWARD_ACCOUNTS==='test')throw Error('Production accounts must use Neon and Better Auth.');
  const devPremium=developmentPremium(env);
  const enabled=env.SKYWARD_ACCOUNTS==='test';
  const origin=env.SKYWARD_PUBLIC_ORIGIN||'http://localhost:8000';
  const parsed=new URL(origin);
  if(parsed.origin!==origin||!['https:','http:'].includes(parsed.protocol))throw Error('Use a canonical SKYWARD_PUBLIC_ORIGIN');
  if(enabled&&parsed.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error('Account cookies require HTTPS outside localhost');
  const localPremium=enabled&&env.SKYWARD_LOCAL_PREMIUM==='1';
  if(localPremium&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error('Local Premium testing requires a loopback public origin');
  const file=dbPath??(enabled?(env.SKYWARD_ACCOUNT_DB||'.local/accounts.sqlite'):':memory:');
  if(file!==':memory:')mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file);if(file!==':memory:')chmodSync(file,0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,customer TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
    CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS usage(user_id TEXT,month TEXT,requests INTEGER NOT NULL,cost INTEGER NOT NULL,PRIMARY KEY(user_id,month));
    CREATE TABLE IF NOT EXISTS journeys(user_id TEXT,key TEXT,body TEXT NOT NULL,PRIMARY KEY(user_id,key));
    CREATE TABLE IF NOT EXISTS checks(user_id TEXT,key TEXT,body TEXT NOT NULL,checked INTEGER,PRIMARY KEY(user_id,key));
    CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY,user_id TEXT,message TEXT,created INTEGER);
    CREATE TABLE IF NOT EXISTS local_test_access(user_id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
  `);
  const run=(sql,...args)=>db.prepare(sql).run(...args),get=(sql,...args)=>db.prepare(sql).get(...args);
  const limits={userRequests:integer(env.SKYWARD_MONTHLY_LOOKUPS,100),globalRequests:integer(env.SKYWARD_GLOBAL_LOOKUPS,1000),budgetMicros:integer(env.SKYWARD_BUDGET_MICROS,1000000),requestMicros:integer(env.SKYWARD_REQUEST_MICROS,1000)};
  const key=env.STRIPE_SECRET_KEY||'',price=env.STRIPE_PRICE_ID||'';
  // Live keys deliberately rejected: test subscriptions must never buy real flight data.
  const billing=enabled&&key.startsWith('sk_test_')&&/^price_[A-Za-z0-9]+$/.test(price);
  const inflight=new Set();
  function throttle(name,max,windowMs) {
    const k=`${Math.floor(now()/windowMs)}:${windowMs}:${digest(name)}`;
    run('INSERT INTO limits VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1',k);
    if(get('SELECT count FROM limits WHERE key=?',k).count>max)fail(429,'Too many attempts. Please wait before trying again.');
    if(get('SELECT COUNT(*) AS n FROM limits').n>10000)run('DELETE FROM limits WHERE rowid IN (SELECT rowid FROM limits ORDER BY rowid LIMIT 5000)');
  }
  const token=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('skyward_session='))?.slice(16)||'';
  function user(req) {return get('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?',digest(token(req)),now());}
  function cookie(res,raw,age=604800){res.setHeader('Set-Cookie',`skyward_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${parsed.protocol==='https:'?'; Secure':''}`);}
  function session(req,res,id){run('DELETE FROM sessions WHERE token=? OR expires<=?',digest(token(req)),now());const raw=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',digest(raw),id,now()+604800000);cookie(res,raw);return raw;}
  async function stripe(path,params,idem) {
    if(!billing)fail(503,'Test checkout is not configured yet.');
    let response;
    try {
      response=await fetchImpl(`https://api.stripe.com/v1/${path}`,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-08-26.dahlia',...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idem?{'Idempotency-Key':idem}:{})},body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok)throw Error('stripe');return await response.json();
    } catch {fail(503,'Subscription service is unavailable. No premium access was granted.');}
  }
  async function entitlement(u) {
    if(devPremium&&u)return true;
    if(localPremium&&get('SELECT expires FROM local_test_access WHERE user_id=? AND expires>?',u.id,now()))return true;
    if(!billing||!u.customer)return false;
    const q=new URLSearchParams({customer:u.customer,status:'active',limit:'100','expand[]':'data.latest_invoice'});
    const subscriptions=await stripe(`subscriptions?${q}`);
    return (subscriptions.data||[]).some(s=>s.livemode===false&&s.status==='active'&&customerId(s.customer)===u.customer&&s.latest_invoice?.status==='paid'&&s.latest_invoice.amount_paid>0&&customerId(s.latest_invoice.customer)===u.customer&&s.items?.data?.some(i=>i.price?.id===price&&i.current_period_end*1000>now()));
  }
  function usage(u) {const month=new Date(now()).toISOString().slice(0,7);return {...(get('SELECT requests,cost FROM usage WHERE user_id=? AND month=?',u.id,month)||{requests:0,cost:0}),limit:limits.userRequests,month,mode:'test',actualProviderSpend:0};}
  function reserve(u) {
    const month=new Date(now()).toISOString().slice(0,7);
    db.exec('BEGIN IMMEDIATE');
    try {
      const own=get('SELECT requests FROM usage WHERE user_id=? AND month=?',u.id,month)?.requests||0;
      const total=get('SELECT COALESCE(SUM(requests),0) AS requests,COALESCE(SUM(cost),0) AS cost FROM usage WHERE month=?',month);
      if(own>=limits.userRequests||total.requests>=limits.globalRequests||total.cost+limits.requestMicros>limits.budgetMicros)fail(429,'Flight-detail allowance reached. No lookup was made.');
      run('INSERT INTO usage VALUES(?,?,1,?) ON CONFLICT(user_id,month) DO UPDATE SET requests=requests+1,cost=cost+excluded.cost',u.id,month,limits.requestMicros);
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  async function lookup(u,journeyKey){
          if(!await entitlement(u))fail(403,'An active paid subscription is required.');
          const journey=get('SELECT body FROM journeys WHERE user_id=? AND key=?',u.id,String(journeyKey||''));if(!journey)fail(404,'Save this journey before checking details.');
          const saved=JSON.parse(journey.body),previous=get('SELECT * FROM checks WHERE user_id=? AND key=?',u.id,saved.key);
          if(previous&&now()-previous.checked<60000)fail(429,'Wait a minute before checking this journey again.');
          reserve(u);
          const sample=airlabsPreview('demo'); // Never call the live adapter from a test subscription.
          const result={...sample,requestedJourney:saved,checkedAt:now(),message:'Synthetic example DEMO101. Not live data for your saved journey.'};
          // Samples remain explicitly separate from saved flight identity; never send fictional alerts.
          run('INSERT INTO checks VALUES(?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET body=excluded.body,checked=excluded.checked',u.id,saved.key,JSON.stringify(result),now());
    return {...result,usage:usage(u)};
  }
  const premium=createPremiumTools({store:sqlitePremiumStore(db),observations,listJourneys:id=>db.prepare('SELECT j.body,c.body AS detail FROM journeys j LEFT JOIN checks c ON j.user_id=c.user_id AND j.key=c.key WHERE j.user_id=?').all(id).map(r=>({...JSON.parse(r.body),details:r.detail?JSON.parse(r.detail):null})),entitlement,env,now,userById:id=>get('SELECT * FROM users WHERE id=?',id),readJourney:(id,key)=>{const j=get('SELECT body FROM journeys WHERE user_id=? AND key=?',id,key),c=get('SELECT body FROM checks WHERE user_id=? AND key=?',id,key);return j?{...JSON.parse(j.body),details:c?JSON.parse(c.body):null}:null;},lookup});
  const accountLibrary=createAccountLibrary(db,{now,entitlement});
  async function body(req) {
    const maximum=req.url?.split('?')[0]==='/api/account/library'?64*1024:8192;
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>maximum)fail(413,'Request too large.');chunks.push(chunk);}
    const raw=Buffer.concat(chunks).toString('utf8');
    try{const value=JSON.parse(raw||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{fail(400,'Invalid request.');}
  }
  async function handle(req,res,url) {
    // Local development gets a private browser session on first entry. Never
    // bootstrap on mutations, static assets, shared pages, or in other modes.
    if(devPremium&&req.method==='GET'&&['/api/account','/flight-simulator/','/airport-simulation/'].includes(url.pathname)&&!user(req)) {
      const id=randomBytes(16).toString('hex');
      run('INSERT INTO users(id,email,password) VALUES(?,?,?)',id,`developer-${id}@local.invalid`,`${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`);
      const raw=session(req,res,id);
      req.headers.cookie=`skyward_session=${raw}`;
    }
    if(await premium.publicHandle(req,res,url))return true;
    if(!/^\/api\/(account(?:\/|$)|billing(?:\/|$)|journeys(?:\/|$)|premium(?:\/|$))/.test(url.pathname))return false;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try {
      if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.');
      if(req.method==='POST'&&(req.headers.origin!==origin||!String(req.headers['content-type']||'').startsWith('application/json')))fail(403,'Use the account controls on this site.');
      throttle(req.socket.remoteAddress||'local',60,60000);
      const u=user(req),path=url.pathname;
      if(path==='/api/account'&&req.method==='GET') {
        const paid=u?await entitlement(u):false;
        send(200,{enabled,billingReady:billing,mode:'test',user:u?{email:u.email,premium:paid}:null,usage:u?usage(u):null});return true;
      }
      if(!enabled)fail(503,'Accounts are not enabled yet. You can keep using Skyward for free.');
      const b=req.method==='POST'?await body(req):{};
      if(['/api/account/register','/api/account/login'].includes(path)&&req.method==='POST') {
        throttle(`auth:${req.socket.remoteAddress}`,8,600000);
        const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof b.password!=='string'||b.password.length<12||b.password.length>128)fail(400,'Use an email and a password of 12–128 characters.');
        throttle(`email:${email}`,8,600000);
        if(inflight.size>16)fail(429,'Please try again shortly.');
        const lock=`auth:${email}`;if(inflight.has(lock))fail(429,'An account request is already running.');inflight.add(lock);
        try {
          let account=get('SELECT * FROM users WHERE email=?',email);
          if(path.endsWith('register')) {
            if(account)fail(409,'Unable to create this account. Try signing in.');
            const salt=randomBytes(16).toString('hex'),hash=await passwordHash(b.password,salt);
            account={id:randomBytes(16).toString('hex'),email};run('INSERT INTO users(id,email,password) VALUES(?,?,?)',account.id,email,`${salt}:${hash.toString('hex')}`);
          }else{
            const [salt,stored]=(account?.password||'00000000000000000000000000000000:'+ '00'.repeat(64)).split(':');
            const hash=await passwordHash(b.password,salt);if(!account||!timingSafeEqual(hash,Buffer.from(stored,'hex')))fail(401,'Email or password is incorrect.');
          }
          session(req,res,account.id);send(200,{ok:true});return true;
        }finally{inflight.delete(lock);}
      }
      if(!u)fail(401,'Sign in to continue.');
      const extra=await premium.handle(path,req.method,u,b);if(extra){send(200,extra);return true;}
      if(await accountLibrary(path,req.method,u,url,b,send))return true;
      if(path==='/api/account/logout'&&req.method==='POST'){run('DELETE FROM sessions WHERE token=?',digest(token(req)));cookie(res,'',0);send(200,{ok:true});return true;}
      if(path==='/api/billing/checkout'&&req.method==='POST') {
        if(inflight.has(u.id))fail(429,'A request is already running.');inflight.add(u.id);
        try {
          if(await entitlement(u))fail(409,'Premium is already active. Use Manage subscription.');
          if(!u.customer){const c=await stripe('customers',{email:u.email,'metadata[skyward_user]':u.id},`skyward-test-customer-${u.id}`);if(c.livemode!==false||!/^cus_/.test(c.id))fail(503,'Invalid checkout configuration.');run('UPDATE users SET customer=? WHERE id=?',c.id,u.id);u.customer=c.id;}
          const checkout=await stripe('checkout/sessions',{mode:'subscription',customer:u.customer,'line_items[0][price]':price,'line_items[0][quantity]':'1',success_url:origin+'/?account=return',cancel_url:origin+'/?account=cancel',client_reference_id:u.id},`skyward-test-checkout-${u.id}-${Math.floor(now()/1800000)}`);
          if(checkout.livemode!==false||!String(checkout.url).startsWith('https://checkout.stripe.com/'))fail(503,'Invalid checkout configuration.');
          send(200,{url:checkout.url});return true;
        }finally{inflight.delete(u.id);}
      }
      if(path==='/api/billing/portal'&&req.method==='POST') {
        if(!u.customer)fail(409,'No subscription account exists yet.');
        const portal=await stripe('billing_portal/sessions',{customer:u.customer,return_url:origin+'/?account=return'});
        if(!String(portal.url).startsWith('https://billing.stripe.com/'))fail(503,'Subscription management is unavailable.');send(200,{url:portal.url});return true;
      }
      if(path==='/api/journeys'&&req.method==='GET') {send(200,{journeys:db.prepare('SELECT body FROM journeys WHERE user_id=? ORDER BY rowid DESC').all(u.id).map(r=>JSON.parse(r.body)),alerts:db.prepare('SELECT id,message,created FROM alerts WHERE user_id=? ORDER BY id DESC LIMIT 50').all(u.id)});return true;}
      if(path==='/api/journeys'&&req.method==='POST') {
        if(b.remove!==true&&!await entitlement(u))fail(403,'Premium is required to save journeys.');
        const callsign=flightCode(b.callsign),hex=String(b.hex||'').toLowerCase(),date=String(b.date||'');
        if(hex&&!/^[a-f0-9]{6}$/.test(hex)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail(400,'Choose a valid flight and date.');
        const k=`${callsign}:${hex||'unassigned'}:${date}`;
        const metadata={};for(const side of ['from','to']){const value=typeof b[side]==='string'?b[side].trim().toUpperCase():'';if(value&&!Object.hasOwn(airports,value))fail(400,'Choose an airport from the directory.');if(value)metadata[side]=value;}
        if(b.remove===true){run('DELETE FROM journeys WHERE user_id=? AND key=?',u.id,k);run('DELETE FROM checks WHERE user_id=? AND key=?',u.id,k);}
        else {if(!get('SELECT key FROM journeys WHERE user_id=? AND key=?',u.id,k)&&get('SELECT COUNT(*) n FROM journeys WHERE user_id=?',u.id).n>=50)fail(429,'Keep up to 50 saved journeys.');run('INSERT INTO journeys VALUES(?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET body=excluded.body',u.id,k,JSON.stringify({key:k,callsign,hex,date,...metadata,alerts:b.alerts===true}));}
        send(200,{ok:true});return true;
      }
      if(path==='/api/premium/schedules')fail(503,'Live schedules require the production account service and verified paid access. No paid request was made.');
   if(path==='/api/premium/details'&&req.method==='POST') {
        if(inflight.has(u.id))fail(429,'A lookup is already running.');inflight.add(u.id);
        try{send(200,await lookup(u,b.key));return true;}finally{inflight.delete(u.id);}
      }
      fail(404,'Endpoint not found.');
    }catch(error){send(error.status||500,{error:error.status?error.message:'Unable to complete this request.'});}
    return true;
  }
  // Called only by a future authorized live lookup after identity/instance validation.
  // Exposed for deterministic testing; no HTTP route can inject observations or alerts.
  function recordVerifiedCheck(userId,journeyKey,result) {
    const journey=get('SELECT body FROM journeys WHERE user_id=? AND key=?',userId,journeyKey);
    if(!journey||result.mode!=='live'||result.status!=='MATCHED_RECENT_AIRCRAFT')return;
    const saved=JSON.parse(journey.body),f=result.flight;
    if(!f||f.callsign!==saved.callsign||f.hex!==saved.hex||!f.departure?.scheduledAt||new Date(f.departure.scheduledAt).toISOString().slice(0,10)!==saved.date)return;
    db.exec('BEGIN IMMEDIATE');
    try {
      const prev=get('SELECT body FROM checks WHERE user_id=? AND key=?',userId,journeyKey),prior=prev?JSON.parse(prev.body):null;
      if(prior&&result.fetchedAt<=prior.fetchedAt){db.exec('COMMIT');return;}
      if(saved.alerts&&prior?.mode==='live')for(const message of changesSince(prior.flight,f))run('INSERT INTO alerts(user_id,message,created) VALUES(?,?,?)',userId,`${saved.callsign}: ${message}`,now());
      run('INSERT INTO checks VALUES(?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET body=excluded.body,checked=excluded.checked',userId,journeyKey,JSON.stringify(result),now());
      run('DELETE FROM alerts WHERE user_id=? AND id NOT IN (SELECT id FROM alerts WHERE user_id=? ORDER BY id DESC LIMIT 50)',userId,userId);
      db.exec('COMMIT');
      if(saved.alerts&&prior?.mode==='live')for(const message of changesSince(prior.flight,f))void premium.notifyVerified(userId,`${journeyKey}:${result.fetchedAt}:${message}`,`${saved.callsign}: ${message}`).catch(()=>{});
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  async function simulatorAccess(req) {
    const account=user(req);
    if(!enabled||!account)return {allowed:false,status:401};
    try {return await entitlement(account)?{allowed:true,status:200}:{allowed:false,status:403};}
    catch {return {allowed:false,status:503};}
  }
  return {handle,db,premiumTick:premium.tick,close:()=>db.close(),recordVerifiedCheck,simulatorAccess};
}
