import {timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
export function authorizedMetrics(header,token){
 if(!token||token.length<24||typeof header!=='string')return false;
 const provided=Buffer.from(header),expected=Buffer.from(`Bearer ${token}`);
 return provided.length===expected.length&&timingSafeEqual(provided,expected);
}
export function clientAddress(req,trustLoopback=false){
 const peer=req.socket.remoteAddress??'unknown';
 if(trustLoopback&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)){
  const forwarded=req.headers['x-forwarded-for'];
  const candidate=typeof forwarded==='string'?forwarded.split(',').at(-1).trim():'';
  if(isIP(candidate))return candidate;
 }
 return peer;
}
export function createOperations(){
 const began=Date.now(),counts={requests:0,errors:0,inFlight:0,totalMs:0,maxMs:0},statuses={};
 return {
  observe(res){const start=performance.now();counts.inFlight++;let done=false;
   const finish=()=>{if(done)return;done=true;const ms=performance.now()-start;counts.inFlight--;counts.requests++;counts.totalMs+=ms;counts.maxMs=Math.max(counts.maxMs,ms);const status=res.writableFinished?res.statusCode:499;statuses[status]=(statuses[status]??0)+1;if(status>=500)counts.errors++;};res.once('finish',finish);res.once('close',finish);
  },
  snapshot(){return {uptimeSeconds:Math.round((Date.now()-began)/1000),requests:counts.requests,errors:counts.errors,inFlight:counts.inFlight,meanMs:counts.requests?Math.round(counts.totalMs/counts.requests):0,maxMs:Math.round(counts.maxMs),statuses:{...statuses},rssBytes:process.memoryUsage().rss};}
 };
}
