import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {errorPage,sendHttpError} from './error-pages.mjs';import {publicPage} from './public-pages.mjs';
test('Recovery documents are self-contained and preserve real HTTP statuses',()=>{
 for(const code of [404,500]){const page=errorPage(code);assert.equal(page.status,code);assert.match(page.type,/text\/html/);assert.match(page.body,/Back to globe/);assert.match(page.body,/noindex/);assert.doesNotMatch(page.body,/<script|stylesheet|Cesium/);}
 assert.equal(publicPage(new URL('https://skyward.test/404')).status,404);assert.equal(publicPage(new URL('https://skyward.test/500')).status,500);assert.match(publicPage(new URL('https://skyward.test/airports/XXX/')).body,/Page not found/);
});
test('API failures stay JSON; document errors are HTML; HEAD and failed compression remain valid',async t=>{
 const server=createServer((req,res)=>{res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length','999');sendHttpError(req,res,500,'Unable to serve this request.');});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const root=`http://127.0.0.1:${server.address().port}`;
 const html=await fetch(root+'/broken',{headers:{Accept:'text/html'}});assert.equal(html.status,500);assert.match(html.headers.get('content-type'),/html/);assert.equal(html.headers.get('content-encoding'),null);assert.equal(html.headers.get('cache-control'),'no-store');assert.match(await html.text(),/Something went wrong/);
 const json=await fetch(root+'/api/broken',{headers:{Accept:'text/html'}});assert.equal(json.status,500);assert.match(json.headers.get('content-type'),/json/);assert.deepEqual(await json.json(),{error:'Unable to serve this request.'});
 const asset=await fetch(root+'/watch/missing.js');assert.match(asset.headers.get('content-type'),/json/);const head=await fetch(root+'/broken',{method:'HEAD'});assert.equal(head.status,500);assert.equal(await head.text(),'');
});
