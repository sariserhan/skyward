import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script id="analytics-bootstrap">([\s\S]*?)<\/script>/)[1];
test('analytics loads asynchronously only on the public production hosts',()=>{
 for(const hostname of ['skyvvard.com','www.skyvvard.com','localhost','127.0.0.1','skyward.workers.dev','preview.example.com','skyvvard.com.example.com']){
  const added=[];runInNewContext(script,{location:{hostname},document:{createElement:()=>({}),head:{appendChild:s=>added.push(s)}}});
  const expected=hostname==='skyvvard.com'||hostname==='www.skyvvard.com';assert.equal(added.length,expected?1:0,hostname);
  if(expected){assert.equal(added[0].async,true);assert.equal(added[0].src,'https://cdn.visitorping.com/site/vp_L56XY64G.js');}
 }
});
