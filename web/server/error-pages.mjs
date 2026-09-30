import {systemMessage} from '../src/lib/systemState.ts';
/** Self-contained recovery pages also work when the app bundle or asset service fails. */
export function errorPage(status){
 const m=systemMessage(status);
 return {status,type:'text/html; charset=utf-8',body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#09141c"><title>${m.title} · Skyward</title><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at top,#173c4c,#09141c 65%);color:#edf6f5;font:17px/1.6 system-ui,sans-serif}main{width:min(100%,650px);padding:clamp(24px,6vw,56px);border:1px solid #456371;border-radius:24px;background:#0c2230}a{color:#b4f3dc}nav{display:flex;flex-wrap:wrap;gap:14px;margin-top:30px;align-items:center}.brand{letter-spacing:.25em;text-decoration:none;font-size:13px}.code{font-size:14px;letter-spacing:.12em;color:#b4f3dc;margin-top:42px}h1{font-size:clamp(30px,6vw,48px);line-height:1.15;margin:12px 0}p{color:#bed1d8;max-width:480px}.primary{padding:12px 20px;background:#b4f3dc;color:#102330;border-radius:9px;text-decoration:none;font-weight:650}a:focus-visible{outline:3px solid #fff;outline-offset:5px}.orbit{width:70px;height:70px;border:1px solid #5d8e9b;border-radius:50%;position:relative;margin-top:30px}.orbit:after{content:'';position:absolute;inset:12px -10px;border:1px solid #92c6bd;border-radius:50%;transform:rotate(-30deg)}</style></head><body><main><a class="brand" href="/"><span style="display:inline-block;white-space:nowrap;text-transform:none;letter-spacing:.035em;color:#e4eef3;font-weight:700">sky<span style="color:#8fdfc8">VV</span>ard</span></a><div class="orbit" aria-hidden="true"></div><div class="code">${m.code}</div><h1>${m.title}</h1><p>${m.description}</p><nav aria-label="Recovery actions">${status>=500?'<a class="primary" href="">Try again</a><a href="/">Back to globe</a>':'<a class="primary" href="/">Back to globe</a>'}<a href="/account/">Your account</a></nav></main></body></html>`};
}
export function sendHttpError(req,res,status,message){
 if(res.headersSent){res.end();return;}
 const pathname=new URL(req.url,'http://localhost').pathname;
 const html=!pathname.startsWith('/api/')&&(req.headers['sec-fetch-dest']==='document'||String(req.headers.accept||'').includes('text/html')||! /\.[a-z0-9]{1,8}$/i.test(pathname));
 const page=html?errorPage(status):{type:'application/json',body:JSON.stringify({error:message})};
 // A failure while compressing a successful response must not retain its encoding/length.
 res.removeHeader('Content-Encoding');res.removeHeader('Content-Length');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 res.writeHead(status,{'Content-Type':page.type});res.end(req.method==='HEAD'?undefined:page.body);
}
