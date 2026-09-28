import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createMembership} from './membership.mjs';

test('Simulator protects documents and assets, provides navigation, and revokes access after cancellation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'skyward-game-'));
  const settings={SKYWARD_ACCOUNTS:'test',SKYWARD_PUBLIC_ORIGIN:'https://skyward.test',SKYWARD_ACCOUNT_DB:join(dir,'accounts.sqlite'),STRIPE_SECRET_KEY:'sk_test_simulator',STRIPE_PRICE_ID:'price_simulator'};
  const original=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
  const seed=createMembership({env:settings});
  seed.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('u','game@example.test','unused','cus_game');
  seed.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('fixture-cookie').digest('hex'),'u',Date.now()+60000);seed.close();
  const realFetch=globalThis.fetch;let paid=false,down=false;
  globalThis.fetch=(url,options)=>{
    if(String(url).startsWith('https://api.stripe.com/')) {
      if(down)return Promise.reject(Error('provider unavailable'));
      return Promise.resolve({ok:true,json:async()=>({data:paid?[{customer:'cus_game',livemode:false,status:'active',latest_invoice:{customer:'cus_game',status:'paid',amount_paid:900},items:{data:[{price:{id:'price_simulator'},current_period_end:Date.now()/1000+3600}]}}]:[]})});
    }
    return realFetch(url,options);
  };
  const {server}=await import('./index.mjs');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,headers={Cookie:'skyward_session=fixture-cookie'};
  try {
    for(const path of ['/airport-simulation/','/airport-simulation/index.html?embed=1','/airport-simulation/index.js','/airport-simulation/index.wasm','/airport-simulation/index.pck']) {
      assert.equal((await fetch(base+path)).status,401);
      assert.equal((await fetch(base+path,{headers})).status,403);
    }
    paid=true;
    const page=await fetch(base+'/airport-simulation/',{headers}),html=await page.text();
    assert.equal(page.status,200);assert.match(html,/href="\/">← Back to Skyward/);assert.match(html,/<iframe/);assert.match(page.headers.get('cache-control'),/private, no-store/);
    const raw=await fetch(base+'/airport-simulation/index.html?embed=1',{headers});assert.equal(raw.status,200);assert.match(await raw.text(),/GODOT_CONFIG/);
    for(const name of ['index.js','index.wasm','index.pck']){const r=await fetch(base+'/airport-simulation/'+name,{headers,method:'HEAD'});assert.equal(r.status,200);assert.ok(Number(r.headers.get('content-length'))>0);assert.match(r.headers.get('cache-control'),/no-store/);}
    paid=false;assert.equal((await fetch(base+'/airport-simulation/index.js',{headers})).status,403);
    assert.equal((await fetch(base+'/airport-simulation/index.html?paid=true',{headers:{Cookie:'premium=true'}})).status,401);
    down=true;assert.equal((await fetch(base+'/airport-simulation/',{headers})).status,503);
    assert.equal((await fetch(base+'/')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));globalThis.fetch=realFetch;for(const [k,v]of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v;}rmSync(dir,{recursive:true,force:true});}
});
