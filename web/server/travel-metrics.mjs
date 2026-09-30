import {authorizedMetrics} from './operations.mjs';
export const travelEvents=['premium_view','trip_start','trip_saved','sharing_created','guest_watch'];
/** Anonymous event totals only. No event log, account IDs, trip data or durable writes. */
export function createTravelMetrics({now=Date.now,env=process.env}={}){
 const days=new Map(),rates=new Map();
 const record=event=>{if(!travelEvents.includes(event))return false;const day=new Date(now()).toISOString().slice(0,10);const row=days.get(day)||{};row[event]=(row[event]||0)+1;days.set(day,row);if(days.size>30)days.delete(days.keys().next().value);return true;};
 return {record,async handle(req,res,url){if(url.pathname!=='/api/travel-metrics')return false;let status=200,value;
 try{if(req.method==='GET'){if(!authorizedMetrics(req.headers.authorization,env.SKYWARD_METRICS_TOKEN))throw Object.assign(Error('Unauthorized'),{status:401});value={scope:'This server process; resets on restart. Event totals, not unique users or conversion cohorts.',days:Object.fromEntries(days)};}
 else if(req.method==='POST'){
  if(req.headers.origin!==(env.SKYWARD_PUBLIC_ORIGIN||'http://localhost:8000'))throw Object.assign(Error('Use this site.'),{status:403});
  const key=req.socket.remoteAddress||'local',r=rates.get(key);if(r&&now()-r.at<60000&&r.count>=30)throw Object.assign(Error('Rate limited'),{status:429});rates.set(key,{at:r&&now()-r.at<60000?r.at:now(),count:r&&now()-r.at<60000?r.count+1:1});if(rates.size>1000)rates.delete(rates.keys().next().value);
  let body='';for await(const chunk of req){body+=chunk;if(body.length>256)throw Object.assign(Error('Event too large'),{status:413});}let b;try{b=JSON.parse(body);}catch{throw Object.assign(Error('Invalid event'),{status:400});}if(!b||Object.keys(b).length!==1||!record(b.event))throw Object.assign(Error('Invalid event'),{status:400});value={ok:true};
 }else throw Object.assign(Error('Method not allowed'),{status:405});}catch(e){status=e.status||500;value={error:e.status?e.message:'Unavailable'};}res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));return true;}};
}
