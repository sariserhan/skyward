/* Shared across globe, account, directory, public pages and simulator shell. No background push. */
(()=>{
 if(window.skywardSpecialFlights||window.top!==window)return;
 const event='skyward:special-flights',interval=60000;
 let snapshot={state:'loading',rows:[],checkedAt:null,checkedAircraft:0,totalAircraft:0},pending=false,lastAttempt=0,banner=null,shown=null,lastBanner=0;
 let dismissed={};try{dismissed=JSON.parse(sessionStorage.getItem('skyward.special-dismissed.v1')||'{}');if(!dismissed||typeof dismissed!=='object'||Array.isArray(dismissed))dismissed={};}catch{}
 const fresh=r=>r&&r.aircraft&&!r.aircraft.simulation&&r.aircraft.ground===false&&Number.isFinite(r.aircraft.observedAt)&&Date.now()-r.aircraft.observedAt<=120000&&r.aircraft.observedAt<=Date.now()+30000&&Number.isFinite(r.aircraft.lat)&&Number.isFinite(r.aircraft.lon)&&typeof r.path==='string'&&/^\/[a-z0-9-]{2,63}\/[a-z0-9-]{2,12}\/$/.test(r.path);
 const emit=()=>window.dispatchEvent(new Event(event));
 const key=r=>r.aircraftId+':'+r.aircraft.callsign;
 const watching=r=>location.pathname.toLowerCase()===r.path||new URLSearchParams(location.hash.slice(1)).get('aircraft')===r.aircraft.hex||location.pathname.toLowerCase()==='/flights/'+String(r.aircraft.callsign).toLowerCase()+'/';
 const globe=()=>['/','/watch/','/watch'].includes(location.pathname)&&!location.hash.includes('scene=flight')||location.pathname.startsWith('/airports/')&&location.pathname.split('/').filter(Boolean).length===2;
 function hide(){banner?.remove();banner=null;shown=null;}
 function render(){
  if(document.hidden||!navigator.onLine||globe()||document.querySelector('dialog[open],[role="dialog"]')){hide();return;}
  const rows=snapshot.rows.filter(fresh).filter(r=>!watching(r));
  if(shown&&rows.some(r=>key(r)===shown))return;
  hide();if(Date.now()-lastBanner<300000)return;
  const row=rows.find(r=>!dismissed[key(r)]||Date.now()-dismissed[key(r)]>21600000);if(!row)return;
  shown=key(row);lastBanner=Date.now();dismissed[shown]=Date.now();
  dismissed=Object.fromEntries(Object.entries(dismissed).filter(([,at])=>Number.isFinite(at)&&Date.now()-at<21600000).slice(-120));
  try{sessionStorage.setItem('skyward.special-dismissed.v1',JSON.stringify(dismissed));}catch{}
  banner=document.createElement('aside');banner.className='special-flight-banner';banner.setAttribute('aria-label','Special aircraft airborne');
  const text=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
  title.textContent=row.name+' aircraft is airborne';detail.textContent=row.registration+' · '+row.relationship;
  text.append(title,detail);
  const watch=document.createElement('a');watch.href=row.path+'#scene=flight&view=side';watch.textContent='Watch flight →';
  const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Dismiss aircraft announcement');close.textContent='×';close.onclick=hide;
  banner.append(text,watch,close);document.body.append(banner);
 }
 async function poll(){
  if(pending||document.hidden||!navigator.onLine||Date.now()-lastAttempt<interval)return;
  pending=true;lastAttempt=Date.now();
  try{const response=await fetch('/api/special-flights',{credentials:'omit',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Unavailable');const data=await response.json();if(!['ready','partial','unavailable'].includes(data.state)||!Array.isArray(data.rows))throw Error('Invalid snapshot');snapshot={...data,rows:data.rows.slice(0,500).filter(fresh)};}
  catch{snapshot={...snapshot,state:'unavailable',rows:[]};}
  finally{pending=false;emit();render();}
 }
 window.skywardSpecialFlights={getSnapshot:()=>snapshot};
 const css=document.createElement('link');css.rel='stylesheet';css.href='/watch/special-flights.css';document.head.append(css);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();render();});
 window.addEventListener('online',()=>void poll());window.addEventListener('offline',render);
 window.addEventListener('popstate',render);window.addEventListener('hashchange',render);
 setInterval(()=>{const rows=snapshot.rows.filter(fresh);if(rows.length!==snapshot.rows.length){snapshot={...snapshot,rows};emit();}void poll();render();},5000);
 emit();void poll();
})();
