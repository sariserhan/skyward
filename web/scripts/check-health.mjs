// Optional local monitoring: no account, remote logging service or upstream polling.
const base=process.env.SKYWARD_URL||'http://localhost:8000';
async function check(){
 try{
  const [health,status]=await Promise.all(['/healthz','/api/status'].map(async p=>{const r=await fetch(new URL(p,base),{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error(`${p}: HTTP ${r.status}`);return r.json();}));
  const age=status.lastPositionAt?Math.max(0,Date.now()-status.lastPositionAt):null;
  console.log(JSON.stringify({time:new Date().toISOString(),app:health.status,positionAgeMs:age,positionState:age===null?'not yet observed':age>120000?'stale':'recent',...status}));
 }catch(e){console.error(JSON.stringify({time:new Date().toISOString(),error:e.message}));if(!process.argv.includes('--watch'))process.exitCode=1;}
}
await check();if(process.argv.includes('--watch'))setInterval(check,60000);
