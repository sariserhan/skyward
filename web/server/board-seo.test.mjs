import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/airport-catalog.json' with {type:'json'};
import {airlineNames} from '../src/lib/airlineNames.ts';
import {publicPage} from './public-pages.mjs';
import worker from '../cloudflare/router.mjs';
const origin='https://skyvvard.com',env={SKYWARD_PUBLIC_ORIGIN:origin};
const page=path=>publicPage(new URL(path,origin),env);
test('every airline and airport board has one sitemap entry, canonical metadata and accurate breadcrumbs',()=>{
 const sitemap=page('/sitemap.xml').body;
 const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 assert.equal(new Set(urls).size,urls.length,'sitemap has no duplicate URLs');
 const paths=[...Object.keys(catalog).map(id=>`/airports/${id}/board/`),...Object.keys(airlineNames).map(code=>`/airlines/${code}/`)];
 for(const path of paths){
  const canonical=origin+path,p=page(path);assert.equal(p.status,200,path);assert.ok(urls.includes(canonical),path);
  assert.doesNotMatch(p.body,/noindex/);assert.ok(p.body.includes(`<link rel="canonical" href="${canonical}">`),path);
  for(const tag of ['<title>','name="description"','property="og:title"','property="og:description"','name="twitter:card"'])assert.ok(p.body.includes(tag),path+' '+tag);
  const schema=JSON.parse(p.body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const crumbs=schema['@graph'].find(s=>s['@type']==='BreadcrumbList').itemListElement;
  assert.equal(crumbs.at(-1).item,canonical);
  if(path.startsWith('/airports/')){
   assert.equal(crumbs.length,4);assert.equal(crumbs[2].item,canonical.replace('board/',''));
   assert.equal(schema['@graph'].find(s=>s['@type']==='Airport').url,crumbs[2].item);
  }else assert.equal(crumbs.length,3);
 }
 assert.match(page('/robots.txt').body,/Sitemap: https:\/\/skyvvard.com\/sitemap.xml/);
});
test('production board responses allow indexing while preview hosts remain excluded',async()=>{
 for(const path of ['/airlines/THY/','/airports/IAD/board/']){
  const response=await worker.fetch(new Request(origin+path),env);
  assert.equal(response.status,200);assert.doesNotMatch(response.headers.get('X-Robots-Tag')||'',/noindex/);assert.doesNotMatch(await response.text(),/noindex/);
  const preview=await worker.fetch(new Request('https://preview.example'+path),env);
  assert.match(preview.headers.get('X-Robots-Tag'),/noindex/);
 }
});
