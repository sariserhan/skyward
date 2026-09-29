import {AIRPORTS} from './feed.mjs';
export function tripQuery(params){
 const q=Object.fromEntries(['from','to','date'].map(k=>[k,(params.get(k)||'').trim().toUpperCase()]));
 if(!Object.hasOwn(AIRPORTS,q.from)||!Object.hasOwn(AIRPORTS,q.to)||q.from===q.to||!/^\d{4}-\d{2}-\d{2}$/.test(q.date)||Number.isNaN(Date.parse(q.date))||new Date(q.date).toISOString().slice(0,10)!==q.date)throw Object.assign(Error('Choose two different airports and a valid departure date.'),{status:400});
 return q;
}
export async function tripResponse(params,now=Date.now()){
 const q=tripQuery(params);
 if(params.get('sample')!=='1')throw Object.assign(Error('Sample mode must be explicit.'),{status:400});
 const date=new Date(now).toISOString().slice(0,10),start=Date.parse(date+'T00:00:00Z');
 return {mode:'demo',partial:true,message:'Synthetic IST → IAD sample. These are not real flights and cannot be opened on the live map.',query:{from:'IST',to:'IAD',date},flights:['scheduled','active','landed','cancelled'].map((status,i)=>({id:`sample:${i}`,callsign:`DEMO${101+i}`,number:`DEMO${101+i}`,airline:'Sample airline',from:'IST',to:'IAD',date,status,departureAt:start+(i+5)*3600000,arrivalAt:start+(i+16)*3600000,hex:null,sample:true}))};
}

// Five bounded circles sample the great-circle corridor, including both airports.
export function tripRegions(q){
 const a=AIRPORTS[q.from],b=AIRPORTS[q.to],rad=Math.PI/180;
 const vector=p=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.cos(p.lat*rad)*Math.sin(p.lon*rad),Math.sin(p.lat*rad)];
 const x=vector(a),y=vector(b),angle=Math.acos(Math.min(1,Math.max(-1,x.reduce((s,n,i)=>s+n*y[i],0))));
 return [0,1,.5,.25,.75].map(f=>{if(f===0)return {...a,radius:100};if(f===1)return {...b,radius:100};if(Math.abs(Math.sin(angle))<.00001)return {...a,radius:100};const v=x.map((n,i)=>(n*Math.sin((1-f)*angle)+y[i]*Math.sin(f*angle))/Math.sin(angle));return {lat:Math.atan2(v[2],Math.hypot(v[0],v[1]))/rad,lon:Math.atan2(v[1],v[0])/rad,radius:250};});
}
const distance=(a,b)=>{const r=Math.PI/180,p=(b.lat-a.lat)*r,l=(b.lon-a.lon)*r,s=Math.sin(p/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(l/2)**2;return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(s)));};
export function createTripDiscovery(feed,{now=Date.now}={}){
 const cache=new Map();let running=false;
 return function discover(q){
  if(q.date!==new Date(now()).toISOString().slice(0,10))return {mode:'observed',flights:[],aircraft:[],partial:true,loading:false,message:'The free feed supplies current observations, not schedules or historical flight lists. Choose today to discover observed aircraft.'};
  const key=q.from+':'+q.to+':'+q.date,old=cache.get(key);
  if(old&&(old.loading||now()-old.started<60000))return old;
  if(running)return {mode:'observed',flights:[],aircraft:[],partial:true,loading:false,message:'Another route discovery is running. Try again shortly.'};
  const state={mode:'observed',flights:old?.flights??[],aircraft:old?.aircraft??[],partial:true,loading:true,started:now(),checkedAt:null,areas:0,routeChecks:0,errors:0,message:'Discovering observed aircraft near both airports and sampled points along the route. Coverage is incomplete; this is not a schedule.'};
  cache.set(key,state);if(cache.size>30)cache.delete(cache.keys().next().value);running=true;
  void (async()=>{
   const candidates=new Map(),started=now();
   try{
    for(const region of tripRegions(q)){
     if(now()-started>45000)break;
     try{const result=await feed.cameraArea(region.lat,region.lon,region.radius);state.areas++;for(const a of result.aircraft)if(a.callsign&&a.lat!==null&&a.lon!==null&&a.observedAt!==null&&now()-a.observedAt<=120000&&now()-a.observedAt>=-5000&&a.targetKind==='aircraft')candidates.set(a.hex,a);}catch(e){state.errors++;if(e.retryAfter)break;}
    }
    // Rotate through candidates on subsequent explicit searches; never fan out
    // a route request for every aircraft in a busy airport region.
    const list=[...candidates.values()].sort((a,b)=>a.hex.localeCompare(b.hex)),offset=(old?.cursor??0)%Math.max(1,list.length),chosen=[...list.slice(offset),...list.slice(0,offset)].slice(0,12);
    state.cursor=offset+chosen.length;
    for(const a of chosen){
     if(now()-started>60000)break;
     try{const route=await feed.route(a.callsign,a.lat,a.lon);state.routeChecks++;
      if(route.status!=='PLAUSIBLE'||route.callsign!==a.callsign||route.airports.length!==2||route.airports[0].iata!==q.from||route.airports[1].iata!==q.to)continue;
      const status=a.ground?(distance(a,AIRPORTS[q.to])<5?'landed':distance(a,AIRPORTS[q.from])<5?'boarding':'unknown'):'active';
      const f={id:`observed:${a.hex}:${a.callsign}`,callsign:a.callsign,number:a.callsign,airline:a.callsign.slice(0,3),...q,status,departureAt:null,arrivalAt:null,hex:a.hex,statusBasis:'observed',observedAt:a.observedAt};
      state.flights=[...state.flights.filter(r=>r.hex!==a.hex),f];state.aircraft=[...state.aircraft.filter(r=>r.hex!==a.hex),a];
     }catch(e){state.errors++;if(e.retryAfter)break;}
    }
   }finally{
    state.flights=state.flights.filter(f=>now()-(f.observedAt??0)<3600000);state.aircraft=state.aircraft.filter(a=>now()-(a.observedAt??0)<3600000);
    state.loading=false;state.checkedAt=now();running=false;
    state.message=`Observed flights only · ${state.areas}/5 sampled areas received · ${state.routeChecks}/${candidates.size} aircraft routes checked${state.errors?' · some lookups unavailable':''}. Refresh to check more candidates. Gaps, unverified routes and flights not transmitting may be missing; departure dates are unconfirmed. Landed observations are retained for up to one hour.`;
   }
  })().catch(()=>{state.loading=false;running=false;state.message='Discovery interrupted. Partial observations are retained.';});
  return state;
 };
}
