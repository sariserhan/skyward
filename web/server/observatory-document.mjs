/** Keep route-specific metadata and readable reference content in the first response. */
export function observatoryDocument(page,shell){
 const assets=(shell.match(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>|<link\b[^>]*(?:rel="stylesheet"|rel="modulepreload"|rel="icon"|rel="manifest")[^>]*>/g)||[]).join('');
 if(!assets.includes('type="module"'))throw Error('Observatory build is unavailable');
 const analytics=shell.match(/<script id="analytics-bootstrap">[\s\S]*?<\/script>/)?.[0]||'';
 const head=page.body.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<link rel="stylesheet" href="\/watch\/public-pages.css">/,'');
 const content=page.body.match(/<body>([\s\S]*?)<\/body>/)[1];
 return `<!doctype html><html lang="en"><head>${head}${assets}${analytics}</head><body style="margin:0;background:#09141c;color:#edf4f6"><div id="root"><div style="font:16px system-ui;max-width:900px;margin:auto;padding:24px">${content}<p role="status">Loading the interactive observatory…</p></div></div></body></html>`;
}
