import {configuredFeed} from '../server/combined-feed.mjs';
if(!process.env.SKYWARD_FLYITALY_API_KEY?.trim()){console.error('Set SKYWARD_FLYITALY_API_KEY in your private server environment first.');process.exitCode=2;}
else if(process.env.SKYWARD_FLYITALY_ENABLED==='0'){console.error('Supplemental feed is disabled.');process.exitCode=2;}
else {try{const feed=configuredFeed(),result=await feed.cameraArea(41.26,28.74,50);console.log(JSON.stringify({aircraft:result.aircraft.length,partial:result.partial,sources:feed.sources.map(s=>({id:s.id,available:s.available,lastSuccessAt:s.lastSuccessAt}))}));if(!feed.sources.find(s=>s.id==='flyitaly')?.available)process.exitCode=1;}catch{console.error('Observation check failed. Verify key, access and network connectivity.');process.exitCode=1;}}
