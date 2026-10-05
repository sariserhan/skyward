import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/airport-catalog.json' with {type:'json'};
import {publicPage} from './public-pages.mjs';
import {airframePage,airframePaths} from './airframe-pages.mjs';
import {observatoryDocument} from './observatory-document.mjs';
const origin='https://skyvvard.com',env={SKYWARD_PUBLIC_ORIGIN:origin};
const page=path=>publicPage(new URL(path,origin),env);
const links=html=>[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
test('every airport is reachable through indexable, self-canonical directory pages',()=>{
 const reached=new Set();let path='/airports/',pages=0;
 while(path){
  const p=page(path);pages++;assert.equal(p.status,200,path);assert.doesNotMatch(p.body,/noindex/,path);
  assert.ok(p.body.includes(`<link rel="canonical" href="${origin+path.replaceAll('&','&amp;')}">`),path);
  for(const l of links(p.body))if(/^\/airports\/[^/?]+\/$/.test(l))reached.add(l.split('/')[2]);
  path=links(p.body).find((l,i,all)=>/^\/airports\/\?page=\d+$/.test(l)&&p.body.includes('Next →')&&all.indexOf(l)===i&&Number(l.split('=')[1])===pages+1)||null;
 }
 assert.deepEqual([...reached].sort(),Object.keys(catalog).sort());
 assert.match(page('/airports/?page=2').body,/<title>Airport directory · page 2 of \d+ · Skyward<\/title>/);
 assert.match(page('/airports/?q=london').body,/noindex/);
});
test('airport pages carry page-specific facts and links to nearby airports',()=>{
 const p=page('/airports/LHR/');
 assert.match(p.body,/Field elevation<\/dt><dd>83 ft \(25 m\)/);assert.match(p.body,/Europe\/London/);
 const nearby=links(p.body).filter(l=>/^\/airports\/[A-Z0-9-]+\/$/.test(l)&&l!=='/airports/LHR/');
 assert.equal(nearby.length,6);assert.ok(nearby.includes('/airports/LGW/'));
});
test('aircraft hubs link every published profile in server HTML',()=>{
 const html=airframePage('/aircraft/').content+airframePage('/notable-aircraft/').content;
 for(const path of airframePaths().filter(p=>/^\/(aircraft|notable)\/[^/]+\/$/.test(p)))assert.ok(html.includes(`href="${path}"`),path);
 assert.notEqual(airframePage('/aircraft/').description,airframePage('/notable-aircraft/').description);
});
test('observatory pages keep reference content outside the app root so it survives rendering',()=>{
 const shell='<html><head><script type="module" src="/watch/assets/main-abc.js"></script></head><body><div id="root"></div></body></html>';
 const html=observatoryDocument(page('/airports/SFO/'),shell);
 const root=html.match(/<div id="root">([\s\S]*?)<\/div>/)[1];
 assert.doesNotMatch(root,/San Francisco/);assert.match(html,/<section id="page-reference"[^>]*>[\s\S]*San Francisco[\s\S]*<\/section>/);assert.doesNotMatch(html,/<main>|<header>/);
 // The page title stays the h1 until the app mounts its own heading, then becomes an h2.
 assert.equal((html.match(/<h1>/g)||[]).length,1);assert.match(html,/MutationObserver[\s\S]*createElement\('h2'\)/);
 // Client-side navigation away from the airport must not leave its details under another route.
 assert.match(html,/getElementById\('page-reference'\)[\s\S]*pushState/);
});
