import source from '../data/airframe-catalog.json' with {type:'json'};
import {publishedCatalog,canonicalId} from '../src/lib/airframeCatalog.ts';
const catalog=publishedCatalog(source);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function airframePage(path){
 const p=path.split('/').filter(Boolean);let title,description='Explore verified aircraft identities and follow an airframe across registration changes.',privatePage=false;
 if(p.length===1&&['aircraft','notable-aircraft','following'].includes(p[0])){title={aircraft:'Aircraft directory','notable-aircraft':'Notable aircraft',following:'Following aircraft'}[p[0]];privatePage=p[0]==='following';}
 else if(p.length===2&&p[0]==='admin'&&p[1]==='notable-aircraft'){title='Aircraft review workbench';privatePage=true;}
 else if(p.length===2&&p[0]==='aircraft'){const a=catalog.aircraft.find(a=>a.id===p[1]);if(!a)return null;if(a.mergedInto)return {redirect:`/aircraft/${canonicalId(catalog,a.id)}/`};title=`${a.registrations.at(-1)?.value??a.id} — ${a.manufacturer} ${a.model}`;description=`${title}. Verified aircraft details, registration history and sources. Aircraft activity does not establish who is onboard.`;}
 else if(p.length===2&&p[0]==='notable'){const e=catalog.entities.find(e=>e.slug===p[1]);if(!e)return null;title=e.displayName+' aircraft';description=e.description;}
 else return null;
 return {title,description,privatePage,path:'/'+p.join('/')+'/'};
}
export function airframeDocument(page,shell){return shell.replace(/<title>[^<]*<\/title>/,'<title>'+escape(page.title)+' · skyVVard</title>').replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escape(page.description)}">`).replace(/<link rel="canonical"[^>]*>/,`<link rel="canonical" href="https://skyvvard.com${page.path}">`).replace(/<meta property="og:title"[^>]*>/,`<meta property="og:title" content="${escape(page.title)} · skyVVard">`).replace(/<meta property="og:description"[^>]*>/,`<meta property="og:description" content="${escape(page.description)}">`).replace(/<meta property="og:url"[^>]*>/,`<meta property="og:url" content="https://skyvvard.com${page.path}">`).replace(/(<h1 id="startup-title"[^>]*>)[^<]*/,`$1${escape(page.title)}`).replace(/(<p id="startup-message"[^>]*>)[^<]*/,`$1${escape(page.description)}`).replace('</head>',page.privatePage?'<meta name="robots" content="noindex,nofollow"></head>':'</head>');}
export function airframePaths(){return ['/aircraft/','/notable-aircraft/','/following/','/admin/notable-aircraft/',...catalog.aircraft.map(a=>`/aircraft/${a.id}/`),...catalog.entities.map(e=>`/notable/${e.slug}/`)];}
