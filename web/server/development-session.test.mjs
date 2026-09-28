import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Local development opens both simulators directly and keeps automatic sessions private',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'skyward-dev-session-'));
 const settings={NODE_ENV:'development',SKYWARD_DEV_PREMIUM:'1',SKYWARD_ACCOUNTS:'test',SKYWARD_PUBLIC_ORIGIN:'http://localhost:8000',SKYWARD_ACCOUNT_DB:join(dir,'account.sqlite')};
 const before=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
 const {server}=await import('./index.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const first=await fetch(base+'/flight-simulator/');assert.equal(first.status,200);assert.match(await first.text(),/id="root"/);
  const cookie=first.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);assert.match(first.headers.get('set-cookie'),/HttpOnly/);
  const account=await fetch(base+'/api/account',{headers:{Cookie:cookie}});const a=await account.json();assert.equal(a.user.premium,true);assert.equal(account.headers.get('set-cookie'),null);
  const game=await fetch(base+'/airport-simulation/');assert.equal(game.status,200);assert.match(await game.text(),/<iframe/);const otherCookie=game.headers.get('set-cookie').split(';')[0];assert.notEqual(otherCookie,cookie);
  const b=await (await fetch(base+'/api/account',{headers:{Cookie:otherCookie}})).json();assert.notEqual(a.user.email,b.user.email);
  const saved=await fetch(base+'/api/account/library',{method:'POST',headers:{Cookie:cookie,Origin:settings.SKYWARD_PUBLIC_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({kind:'views',key:'private-dev',revision:0,value:{name:'Private dev view',settings:{}}})});assert.equal(saved.status,200);
  const privateList=await (await fetch(base+'/api/account/library?kind=views',{headers:{Cookie:otherCookie}})).json();assert.equal(JSON.stringify(privateList).includes('Private dev view'),false);
  const noCookie=await fetch(base+'/api/premium/details',{method:'POST',headers:{Origin:settings.SKYWARD_PUBLIC_ORIGIN,'Content-Type':'application/json'},body:'{}'});assert.equal(noCookie.status,401);
 }finally{await new Promise(r=>server.close(r));for(const [k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}rmSync(dir,{recursive:true,force:true});}
});
