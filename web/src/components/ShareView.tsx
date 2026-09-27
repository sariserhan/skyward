import { useState } from 'react';
export function ShareView({airport,hex,facility,mode}:{airport:string;hex?:string;facility?:string;mode:string}) {
  const [open,setOpen]=useState(false),[message,setMessage]=useState('');
  const url=new URL(location.pathname,location.origin),q=new URLSearchParams({airport,mode});
  if(hex)q.set('aircraft',hex);else if(facility)q.set('facility',facility);url.hash=q.toString();
  return <div className="share-view"><button className="quiet-button" aria-expanded={open} onClick={()=>{setOpen(!open);setMessage('');}}>Share view</button>{open&&<section className="share-panel" aria-label="Share current view"><h2>Open this view again</h2><input aria-label="Shareable view link" readOnly value={url.href} onFocus={e=>e.target.select()}/><p>The link opens current observations, not a recording. The recipient must have access to this app’s host. A localhost link works only on this computer.</p><div><button className="quiet-button" onClick={async()=>{try{await navigator.clipboard.writeText(url.href);setMessage('Link copied');}catch{setMessage('Select the link above and copy it manually.');}}}>Copy link</button><button className="quiet-button" onClick={()=>setOpen(false)}>Close share</button></div><p role="status">{message}</p></section>}</div>;
}
