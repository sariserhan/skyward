/* Account writes are authenticated and Premium-checked by the server. */
(()=>{
 const byId=id=>document.getElementById(id),status=byId('cloud-status'),slots=byId('cloud-slots');
 let ready=false,busy=false,current=null,pending=null;
 const buttons=['cloud-save','cloud-load','cloud-start','cloud-export'];
 function enabled(){for(const id of buttons)byId(id).disabled=!ready||busy;}
 async function api(body,key){
  const response=await fetch('/api/account/library'+(body?'':'?kind=simulator'+(key?'&key='+encodeURIComponent(key):'')),{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Cloud save unavailable.');return data;
 }
 function command(action,value){return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),timer=setTimeout(()=>{pending=null;reject(Error('Simulator did not respond. Wait for it to finish loading.'));},15000);
  pending={id,resolve:v=>{clearTimeout(timer);pending=null;resolve(v);},reject:e=>{clearTimeout(timer);pending=null;reject(e);}};
  document.querySelector('iframe').contentWindow.postMessage({type:'skyward-game-command',id,action,value},location.origin);
 });}
 async function refresh(){const data=await api();slots.replaceChildren(new Option('Choose legacy cloud save',''));for(const r of data.items.filter(r=>r.value?.kind!=='career-progress'))slots.add(new Option(r.name+' · '+new Date(r.updated).toLocaleString(),r.key));if(current)slots.value=current.key;}
 async function run(action){if(busy)return;busy=true;enabled();try{await action();}catch(e){status.textContent=e.message;}finally{busy=false;enabled();}}
 async function load(key){if(!key)throw Error('Choose a cloud save.');const item=await api(null,key);if(item.value?.kind==='career-progress')throw Error('This is a progress summary. Import a full local backup to resume.');await command('restore',item.value);current=null;slots.value=key;status.textContent='Legacy career restored. Export a full backup before leaving.';}
 addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==document.querySelector('iframe').contentWindow)return;
  let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(data?.type==='skyward-game-ready'){
   ready=true;enabled();void run(async()=>{await refresh();const key=new URLSearchParams(location.search).get('save');if(key)await load(key);else status.textContent='Ready. Account saves sync small progress summaries. Export a backup to resume the full game elsewhere.';});
  }else if(data?.type==='skyward-game-result'&&pending?.id===data.id){if(data.ok)pending.resolve(data.value);else pending.reject(Error(String(data.value)));}
 });
 byId('cloud-export').onclick=()=>void run(async()=>{const value=await command('snapshot'),url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='skyward-career.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Full backup exported to this device.';});
 byId('cloud-save').onclick=()=>void run(async()=>{const snapshot=await command('snapshot'),c=snapshot.career;if(!c)throw Error('Start a career before saving progress.');const value={kind:'career-progress',version:1,career_id:c.career_id,airport_name:c.airport_name,day:c.day,cash_cents:c.cash_cents,phase:c.phase,mode:c.mode,difficulty:c.difficulty};const key=current?.key||crypto.randomUUID();const saved=await api({kind:'simulator',key,revision:current?.revision??0,value});current={key,revision:saved.revision};await refresh();status.textContent='Progress summary saved to your account. Export a backup to resume the full game elsewhere.';});
 byId('cloud-load').onclick=()=>{if(confirm('Replace the current game with this cloud save? Unsaved progress will be lost.'))void run(()=>load(slots.value));};
 byId('cloud-start').onclick=()=>{if(confirm('Start this scenario? Export a full backup first to preserve the current game.'))void run(async()=>{await command('scenario',byId('cloud-scenario').value);current=null;slots.value='';status.textContent='Scenario started. Save a progress summary to your account or export a full backup.';});};
})();
