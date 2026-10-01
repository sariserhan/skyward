/** Read-only, bounded post-deployment SEO/link check. No API or paid-feed requests. */
import {airframePaths,airframePage} from '../server/airframe-pages.mjs';
import {specialFlightPaths} from '../src/lib/specialFlightRoutes.ts';
const origin=new URL(process.argv[2]||'https://skyvvard.com').origin;
if(!/^https:\/\//.test(origin)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))throw Error('Use HTTPS or a local test server');
const paths=airframePaths().filter(p=>{const row=airframePage(p);return !row.privatePage&&!row.redirect;});
const sample=[...new Set(['/','/notable-aircraft/','/collections/sports/','/collections/companies/','/collections/special/','/collections/historic/',...paths.filter(p=>p.startsWith('/aircraft/')).slice(0,3),...paths.filter(p=>p.startsWith('/notable/')).slice(0,3),...specialFlightPaths().slice(0,2)])];
let requests=0;const images=new Set();
async function get(path){requests++;const r=await fetch(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r;}
const sitemap=await (await get('/sitemap.xml')).text(),robots=await (await get('/robots.txt')).text();
if(!robots.includes('Sitemap: '+origin+'/sitemap.xml'))throw Error('Incorrect robots sitemap origin');
for(const path of paths)if(!sitemap.includes(`<loc>${origin+path}</loc>`))throw Error(`Missing sitemap entry: ${path}`);
for(const path of ['/account/','/following/','/admin/notable-aircraft/',...specialFlightPaths()])if(sitemap.includes(`<loc>${origin+path}</loc>`))throw Error(`Unexpected indexed URL: ${path}`);
for(const path of sample){
 const html=await (await get(path)).text();
 if(!html.includes(`rel="canonical" href="${origin+path}"`))throw Error(`Incorrect canonical: ${path}`);
 const image=html.match(/property="og:image" content="([^"]+)"/)?.[1];
 if(!image||!html.includes('name="twitter:card" content="summary_large_image"'))throw Error(`Missing social preview: ${path}`);
 if(!images.has(image)){images.add(image);const response=await get(image);if(!response.headers.get('content-type')?.includes('image/png'))throw Error(`Not a PNG: ${image}`);const bytes=new Uint8Array(await response.arrayBuffer());const data=new DataView(bytes.buffer);if(bytes.length<24||data.getUint32(16)!==1200||data.getUint32(20)!==630)throw Error(`Invalid image dimensions: ${image}`);}
 // Validate internal discovery links against the complete sitemap, avoiding a crawl of thousands of airports.
 for(const [,link] of html.matchAll(/href="(\/(?:aircraft|notable|collections)\/[^"?#]+\/?)"/g))if(!sitemap.includes(`<loc>${origin+link}</loc>`))throw Error(`Broken/unpublished discovery link ${link} on ${path}`);
 console.log('PASS',path);
}
console.log(`Verified ${paths.length} sitemap entries, ${sample.length} page samples and ${images.size} images in ${requests} requests. No aviation API requests.`);
