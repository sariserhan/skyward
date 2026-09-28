/* Account writes are authenticated and Premium-checked by the server. */
(()=>{
 const byId=id=>document.getElementById(id),status=byId('cloud-status'),slots=byId('cloud-slots');
 let ready=false,busy=false,current=null,pending=null;
 const buttons=['cloud-save','cloud-load','cloud-start'];
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
 async function refresh(){const data=await api();slots.replaceChildren(new Option('Choose cloud save',''));for(const r of data.items)slots.add(new Option(r.name+' · '+new Date(r.updated).toLocaleString(),r.key));if(current)slots.value=current.key;}
 async function run(action){if(busy)return;busy=true;enabled();try{await action();}catch(e){status.textContent=e.message;}finally{busy=false;enabled();}}
 async function load(key){if(!key)throw Error('Choose a cloud save.');const item=await api(null,key);await command('restore',item.value);current=item;slots.value=key;status.textContent='Career restored. Save progress to account before leaving.';}
 addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==document.querySelector('iframe').contentWindow)return;
  let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(data?.type==='skyward-game-ready'){
   ready=true;enabled();void run(async()=>{await refresh();const key=new URLSearchParams(location.search).get('save');if(key)await load(key);else status.textContent='Ready. Cloud saves are manual; save before changing scenarios or leaving.';});
  }else if(data?.type==='skyward-game-result'&&pending?.id===data.id){if(data.ok)pending.resolve(data.value);else pending.reject(Error(String(data.value)));}
 });
 byId('cloud-save').onclick=()=>void run(async()=>{const value=await command('snapshot');const key=current?.key||crypto.randomUUID();const saved=await api({kind:'simulator',key,revision:current?.revision??0,value});current={key,revision:saved.revision};await refresh();status.textContent='Progress saved to your account.';});
 byId('cloud-load').onclick=()=>{if(confirm('Replace the current game with this cloud save? Unsaved progress will be lost.'))void run(()=>load(slots.value));};
 byId('cloud-start').onclick=()=>{if(confirm('Start this scenario? Save current progress first.'))void run(async()=>{await command('scenario',byId('cloud-scenario').value);current=null;slots.value='';status.textContent='Scenario started. Use Save progress to account to keep a cloud copy.';});};
})();
