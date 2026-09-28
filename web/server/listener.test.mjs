import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

test('Default startup responds through IPv4 and IPv6 localhost', {timeout:15000}, async()=>{
  const env={...process.env,PORT:'0',SKYWARD_ACCOUNTS:'disabled',SKYWARD_PUBLIC_ORIGIN:'http://localhost:8000'};delete env.HOST;
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env,stdio:['ignore','pipe','pipe']});
  const done=once(child,'exit');let output='',errors='';child.stderr.on('data',b=>{errors+=b;});
  try {
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Startup timeout: '+errors)),5000);
      child.stdout.on('data',b=>{output+=b;const match=output.match(/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('exit',code=>{clearTimeout(timer);reject(Error(`Server exited ${code}: ${errors}`));});
    });
    for(const host of ['127.0.0.1','[::1]']) {
      const response=await fetch(`http://${host}:${port}/healthz`,{signal:AbortSignal.timeout(3000)});
      assert.equal(response.status,200);assert.equal((await response.json()).service,'skyward');
    }
  }finally{child.kill('SIGTERM');await done;}
});

test('Server can restart on the same forwarded port and serve a fresh homepage', {timeout:20000},async()=>{
 async function start(port){
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SKYWARD_ACCOUNTS:'disabled'},stdio:['ignore','pipe','pipe']});let text='',errors='';child.stderr.on('data',b=>errors+=b);const exited=once(child,'exit');
  try{const actual=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Restart timeout: '+errors)),6000);child.stdout.on('data',b=>{text+=b;const m=text.match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',()=>{clearTimeout(timer);reject(Error(errors));});});return {port:actual,stop:async()=>{child.kill('SIGTERM');await exited;}};}catch(e){child.kill('SIGTERM');await exited;throw e;}
 }
 const first=await start(0),port=first.port;await first.stop();const second=await start(port);
 try{const base=`http://127.0.0.1:${port}`;assert.equal((await (await fetch(base+'/healthz',{signal:AbortSignal.timeout(3000)})).json()).service,'skyward');const response=await fetch(base+'/',{signal:AbortSignal.timeout(3000)});assert.equal(response.status,200);assert.match(await response.text(),/Skyward/i);}finally{await second.stop();}
});
