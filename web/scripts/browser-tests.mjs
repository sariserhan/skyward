import {spawnSync} from 'node:child_process';
const python=process.env.SKYWARD_QA_PYTHON||'python3';
const check=spawnSync(python,['-c','import playwright.sync_api'],{stdio:'pipe'});
if(check.status!==0){console.error('Browser tests require Python Playwright and Chromium. Set SKYWARD_QA_PYTHON to an interpreter with Playwright installed. See tests/browser/README.md.');process.exit(1);}
const result=spawnSync(python,[process.argv.includes('--soak')?'tests/browser/soak.py':'tests/browser/regression.py'],{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});process.exit(result.status??1);
