const fail=()=>{throw Object.assign(Error('Invalid flight replay.'),{status:400});};
const number=(v,min,max)=>{if(!Number.isFinite(v)||v<min||v>max)fail();return v;};
const text=(v)=>typeof v==='string'?v.slice(0,300):'';
export function validateReplay(v){
 if(!v||!Array.isArray(v.samples)||v.samples.length<1||v.samples.length>1800||!Array.isArray(v.events)||v.events.length>100)fail();
 let previous=-1;const samples=v.samples.map(s=>{if(!s||s.time<previous)fail();previous=number(s.time,0,86400);return {time:previous,lat:number(s.lat,-90,90),lon:number(s.lon,-180,180),altitude:number(s.altitude,0,100000),speed:number(s.speed,0,1000),fuel:number(s.fuel,0,20000),phase:text(s.phase),warning:text(s.warning)};});
 const events=v.events.map(e=>{if(!e||typeof e!=='object')fail();return {time:number(e.time,0,86400),text:text(e.text)};});const out={samples,events,interval:number(v.interval,0,86400),maxAltitude:Math.max(...samples.map(s=>s.altitude)),lastWarning:'',offRoute:false};
 if(v.touchdown)out.touchdown={rate:number(v.touchdown.rate,-20000,20000),cross:number(v.touchdown.cross,-1e8,1e8),score:number(v.touchdown.score,0,100)};
 return out;
}
export function librarySummary(kind,v){if(kind!=='missions')return v;const {replay,...summary}=v;return {...summary,hasReplay:!!replay};}
