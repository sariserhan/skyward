import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const python=process.env.SKYWARD_QA_PYTHON||'python3',report={started:new Date().toISOString(),checks:[]};
const output=process.env.SKYWARD_RELEASE_REPORT||join(tmpdir(),'skyward-release-check.json');
const checks=[['unit/security/landing matrix','npm',['test']],['production build','npm',['run','build']],...['architecture','regression','customer','experience-improvements','demo-operations','flight-coach','watched-arrival','soak'].map(s=>[s,python,[`tests/browser/${s}.py`]])];
for(const [name,cmd,args] of checks){console.log(`\nChecking ${name}`);const start=Date.now(),r=spawnSync(cmd,args,{stdio:'inherit',env:{...process.env,NODE_ENV:name==='production build'?'production':'test',SKYWARD_ACCOUNT_DB:':memory:',SKYWARD_FLYITALY_API_KEY:'',SKYWARD_ACCOUNTS:'disabled',PYTHONDONTWRITEBYTECODE:'1'}});report.checks.push({name,passed:r.status===0,seconds:Math.round((Date.now()-start)/1000)});writeFileSync(output,JSON.stringify(report,null,2));if(r.status!==0){console.error(`Release check failed: ${name}. Report: ${output}`);process.exit(1);}}
console.log(`Release checks passed. Report: ${output}`);
