import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {airframePaths,airframePage,airframeDocument} from './airframe-pages.mjs';
import {publicPage} from './public-pages.mjs';
import {specialFlightPaths} from '../src/lib/specialFlightRoutes.ts';
const origin='https://skyvvard.com',env={SKYWARD_PUBLIC_ORIGIN:origin};
const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('every published aircraft and organization profile has canonical metadata and sitemap coverage',()=>{
 const sitemap=publicPage(new URL('/sitemap.xml',origin),env).body;
 for(const path of airframePaths()){
  const page=airframePage(path);
  if(page.redirect)continue;
  assert.equal(sitemap.includes(`<loc>${origin+path}</loc>`),!page.privatePage,path);
  const html=airframeDocument(page,shell);
  assert.ok(html.includes(`rel="canonical" href="${origin+path}"`),path);
  for(const name of ['og:title','og:description','og:url','og:image','twitter:title','twitter:description','twitter:image'])assert.equal((html.match(new RegExp(`(?:name|property)="${name}"`,'g'))||[]).length,1,`${path} ${name}`);
  assert.match(html,/og:image:width" content="1200/);
  assert.match(html,/og:image:height" content="630/);
 }
});
test('special watch links retain share metadata without claiming current activity or entering the sitemap',()=>{
 const sitemap=publicPage(new URL('/sitemap.xml',origin),env).body;
 for(const path of specialFlightPaths()){
  const page=publicPage(new URL(path,origin),env);
  assert.equal(page.status,200,path);
  assert.match(page.body,/noindex,follow/);
  assert.ok(!sitemap.includes(`<loc>${origin+path}</loc>`),path);
  assert.match(page.body,/name="twitter:image" content="https:\/\/skyvvard.com\/watch\/social-card.png"/);
  assert.match(page.body,/No current position is asserted/);
 }
 const png=readFileSync(new URL('../public/social-card.png',import.meta.url));
 assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
});
