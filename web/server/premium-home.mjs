import airports from '../data/airport-catalog.json' with {type:'json'};
export function aviationFeed(rows,preferences,now){
 const selected=preferences.airports||[],types=preferences.types||[];
 const distance=(a,b)=>{const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 6880.13*Math.asin(Math.min(1,Math.sqrt(x)));};
 return rows.filter(a=>!a.simulation&&a.targetKind==='aircraft'&&/^[a-f0-9]{6}$/i.test(a.hex)&&Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Number.isFinite(a.observedAt)&&now-a.observedAt>=-5000&&now-a.observedAt<=120000).flatMap(a=>{const near=selected.filter(id=>airports[id]&&distance(a,airports[id])<=50),favorite=types.includes(a.aircraftType);return near.length||favorite?[{hex:a.hex,callsign:a.callsign,aircraftType:a.aircraftType,observedAt:a.observedAt,near,favorite}]:[];}).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.observedAt-a.observedAt).slice(0,20);
}
export function createPremiumHome({store,listJourneys,observations,now}){
 return async(path,method,u,b)=>{
  if(!['/api/premium/home','/api/premium/preferences'].includes(path))return null;
  if(path.endsWith('preferences')&&method==='POST'){
   if(!['trip','family','explore'].includes(b.intent)||!Array.isArray(b.airports)||b.airports.length>12||b.airports.some(id=>!Object.hasOwn(airports,id))||!Array.isArray(b.types)||b.types.length>10||b.types.some(t=>typeof t!=='string'||!/^[A-Z0-9]{2,8}$/.test(t)))throw Object.assign(Error('Choose an intent, up to 12 known airports and 10 aircraft types.'),{status:400});
   await store.put(u.id,'preferences','home',{intent:b.intent,airports:[...new Set(b.airports)],types:[...new Set(b.types)],onboarded:true},1);return {ok:true};
  }
  const preferences=await store.get(u.id,'preferences','home')||{intent:'trip',airports:[],types:[],onboarded:false};
  const [family,monitors,rules,shares,journeys,budget]=await Promise.all([store.list(u.id,'family'),store.list(u.id,'monitor'),store.list(u.id,'spotter'),store.list(u.id,'share'),listJourneys(u.id),store.get(u.id,'monitor-budget',new Date(now()).toISOString().slice(0,7))]);
  return {preferences,family,journeys,feed:aviationFeed(observations(),preferences,now()),checkedAt:now(),usage:{monitors:monitors.filter(m=>m.value.enabled&&m.value.endsAt>now()).length,monitorLimit:10,backgroundChecks:budget?.used||0,backgroundLimit:30,spotterRules:rules.length,spotterLimit:10,shares:shares.filter(s=>s.value.expires>now()).length,journeys:journeys.length,journeyLimit:50,resetAt:Date.UTC(new Date(now()).getUTCFullYear(),new Date(now()).getUTCMonth()+1,1)}};
 };
}
