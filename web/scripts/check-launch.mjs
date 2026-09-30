// Public, read-only production checks. No signups, emails, checkout or paid calls.
const origin=new URL(process.argv[2]||'https://skyvvard.com');
if(!['https:','http:'].includes(origin.protocol))throw Error('Use an HTTP(S) origin');
const checks=[];
async function get(path){const r=await fetch(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(15000)});return {status:r.status,text:await r.text()};}
for(const [path,expected] of [['/',200],['/healthz',200],['/account/',200],['/terms/',200],['/privacy/',200],['/contact/',200],['/not-a-real-launch-page',404],['/api/premium/schedules',401],['/airport-simulation/',401]]){
 try{const r=await get(path);checks.push({path,status:r.status,pass:r.status===expected});}catch{checks.push({path,pass:false,error:'Request unavailable'});}
}
try{const r=await get('/api/account'),a=JSON.parse(r.text);checks.push({check:'live checkout configuration',pass:a.enabled===true&&a.mode==='live'&&a.billingReady===true});checks.push({check:'live flight details',pass:a.liveDetailsReady===true});}catch{checks.push({check:'account readiness',pass:false});}
try{const r=await get('/premium/');checks.push({check:'premium copy',pass:r.status===200&&!/public subscriptions are coming soon/i.test(r.text)});}catch{checks.push({check:'premium copy',pass:false});}
console.log(JSON.stringify({origin:origin.origin,checks,note:'These checks do not verify a payment, inbox delivery, webhook signatures, coverage or subscription cancellation.'},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
