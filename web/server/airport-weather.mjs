import airports from '../data/airport-catalog.json' with {type:'json'};
export function createAirportWeather({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();let next=0;
 return async function weather(id){
  if(!Object.hasOwn(airports,id))throw Object.assign(Error('Choose an airport.'),{status:400});
  const cached=cache.get(id);if(cached&&now()-cached.fetchedAt<900000)return cached;
  if(pending.has(id))return pending.get(id);
  if(now()<next)throw Object.assign(Error('Wait a moment before refreshing weather.'),{status:429});next=now()+1500;
  const operation=(async()=>{const r=await fetchImpl('https://aviationweather.gov/api/data/metar?format=json&ids='+encodeURIComponent(airports[id].icao),{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('Weather unavailable.');const data=await r.json(),m=Array.isArray(data)?data.find(x=>x.icaoId===airports[id].icao):null;const value={airport:id,fetchedAt:now(),observation:m&&Number.isFinite(Number(m.obsTime))&&Number(m.obsTime)>0?{station:m.icaoId,observedAt:Number(m.obsTime)*1000,raw:String(m.rawOb||'').slice(0,500),windDirection:m.wdir,windSpeed:m.wspd,gust:m.wgst??null,visibility:m.visib??null,category:m.fltCat??null}:null};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(id,value);return value;})();pending.set(id,operation);try{return await operation;}finally{pending.delete(id);}
 };
}
