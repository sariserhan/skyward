import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const python=process.env.SKYWARD_QA_PYTHON||'python3';
const selected=process.argv.find(a=>a.startsWith('--browser='))?.split('=')[1];
if(selected&&!['chromium','firefox','webkit'].includes(selected))throw Error('Use --browser=chromium, firefox or webkit');
const directory=process.env.SKYWARD_QA_ARTIFACTS||join(tmpdir(),`skyward-devices-${Date.now()}`);mkdirSync(directory,{recursive:true});
const report={createdAt:new Date().toISOString(),physicalHardware:'NOT TESTED: Playwright emulation is not physical Safari, GPU or phone verification',checks:[]};
let failed=false;
for(const browser of selected?[selected]:['chromium','firefox','webkit']){
 const probe=spawnSync(python,['-c',`from playwright.sync_api import sync_playwright
from pathlib import Path
with sync_playwright() as p: assert Path(p.${browser}.executable_path).exists(), 'Browser is not installed'`],{encoding:'utf8'});
 if(probe.status!==0){report.checks.push({browser,status:'BLOCKED',reason:'Playwright browser or Python package unavailable'});failed=true;continue;}
 for(const flow of ['account-recovery','recording-premium','performance-capture','landing']){
  const start=Date.now(),r=spawnSync(python,[`tests/browser/${flow}.py`],{stdio:'inherit',env:{...process.env,SKYWARD_QA_BROWSER:browser,SKYWARD_QA_ARTIFACTS:join(directory,browser,flow),PYTHONDONTWRITEBYTECODE:'1'}});
  report.checks.push({browser,flow,status:r.status===0?'PASS':'FAIL',seconds:Math.round((Date.now()-start)/1000)});failed ||= r.status!==0;
  writeFileSync(join(directory,'release-matrix.json'),JSON.stringify(report,null,2));
 }
}
writeFileSync(join(directory,'release-matrix.json'),JSON.stringify(report,null,2));console.log(`Device matrix: ${directory}/release-matrix.json`);process.exitCode=failed?1:0;
