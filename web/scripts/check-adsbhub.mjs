import {connect} from 'node:net';
import {HubFeed} from '../server/hub-feed.mjs';
const mode=process.argv[2];
if(!['--local','--hub','--self-test'].includes(mode)){
 console.log('Usage: node web/scripts/check-adsbhub.mjs --local | --hub | --self-test\n--local reads 127.0.0.1:30003 on the receiver host.\n--hub reads data.adsbhub.org:5002 after confirmed account/IP access.\nReads for at most 20 seconds; never uploads or changes settings.');
 process.exitCode=mode?2:0;
}else if(mode==='--self-test'){
 const now=Date.now(),h=new HubFeed({start:false,now:()=>now}),v=Array(22).fill('');v[0]='MSG';v[1]='3';v[4]='ABCDEF';v[6]=new Date(now).toISOString().slice(0,10).replaceAll('-','/');v[7]=new Date(now).toISOString().slice(11,23);v[11]='10000';v[14]='0';v[15]='0';v[21]='0';h.connected=true;h.ingest(v.join(','));if(h.snapshot().aircraft[0]?.observedAt!==now)throw Error('Parser self-test failed');h.close();console.log('PASS synthetic parser self-test. No network connection or data submission.');
}else if(mode==='--hub'&&process.env.SKYWARD_ADSBHUB_ACCESS!=='confirmed'){
 console.error('Not checked: first register your receiver, feed its real observations, and authorize this server IP in ADSBHub. Then set SKYWARD_ADSBHUB_ACCESS=confirmed for this check.');process.exitCode=2;
}else{
 const host=mode==='--local'?'127.0.0.1':'data.adsbhub.org',port=mode==='--local'?30003:5002,h=new HubFeed({start:false});let buffer='',bytes=0,lines=0,finished=false;
 const socket=connect({host,port});socket.setEncoding('utf8');const timer=setTimeout(()=>finish('Observation window ended.'),20000);
 function finish(reason){if(finished)return;finished=true;clearTimeout(timer);socket.destroy();let count=0;try{count=h.snapshot().aircraft.length;}catch{}h.close();console.log(JSON.stringify({endpoint:host+':'+port,bytes,lines,recentPositionsWithUTCTimestamps:count,result:count?'PASS':'NOT_READY',reason}));if(!count)process.exitCode=1;}
 socket.on('connect',()=>{h.connected=true;});socket.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);buffer+=chunk;if(buffer.length>262144)return finish('Oversized stream frame.');let end;while((end=buffer.indexOf('\n'))>=0){lines++;h.ingest(buffer.slice(0,end).trim());buffer=buffer.slice(end+1);}try{if(h.snapshot().aircraft.length>=3)finish('Recent timestamped positions received.');}catch{}});
 socket.on('error',e=>finish('Connection failed: '+(e.code||'unknown')));socket.on('end',()=>finish('Remote connection closed.'));
}
