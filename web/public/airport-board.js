const root=document.querySelector('.airport-board');
if(root){
 const airline=root.dataset.airline,id=airline||root.dataset.airport,timezone=root.dataset.timezone,$=id=>document.getElementById(id),tabs=[...root.querySelectorAll('[role=tab]')];
 const saved=new Map();let direction=airline?'all':'departures',busy=false,ready=false;
 const dataKey=()=>airline?'airline':direction;
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,...(airline?{year:'numeric'}:{}),month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const time=value=>typeof value==='number'&&Number.isFinite(value)?clock.format(value):'Not supplied';
 const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text??'';if(cls)node.className=cls;return node;};
 function controls(){const load=$('board-refresh');load.disabled=busy||!ready;load.textContent=busy?'Loading…':(saved.has(dataKey())?'Refresh ':'Load ')+(airline?'flights':direction);root.setAttribute('aria-busy',String(busy));}
 function render(){
  const data=saved.get(dataKey()),side=airline||direction==='departures'?'departure':'arrival',other=direction==='departures'?'arrival':'departure',query=$('board-search').value.trim().toLowerCase();
  if(!airline)$('board-place').textContent=direction==='departures'?'Destination':'Origin';$('board-caption').textContent=airline?`${id} ${direction==='current'?'active':direction==='all'?'supplied':direction} flights · dates and times in UTC`:`${id} ${direction} · airport-local dates and times`;
  const rows=(data?.flights||[]).filter(f=>!airline||direction==='all'||direction==='current'&&f.status==='active'||direction==='upcoming'&&f.status==='scheduled'&&(f.departure?.estimatedAt??f.departure?.scheduledAt??0)>Date.now()).filter(f=>[f.callsign,f.number,f.aircraftType,f[other]?.airport,f[other]?.name,f[other]?.city,...(airline?[f.departure?.airport,f.departure?.name,f.departure?.city,f.arrival?.airport,f.arrival?.name,f.arrival?.city]:[])].some(s=>String(s||'').toLowerCase().includes(query))).sort((a,b)=>(a[side]?.scheduledAt??Infinity)-(b[side]?.scheduledAt??Infinity));
  $('board-rows').replaceChildren();
  for(const flight of rows){
   const info=flight[side]||{},place=flight[other]?.airport,tr=document.createElement('tr'),when=el('td',time(info.scheduledAt));
   if(info.actualAt)when.append(el('small','Actual '+time(info.actualAt)));else if(info.estimatedAt)when.append(el('small','Expected '+time(info.estimatedAt)));
   const code=el('td',''),callsign=String(flight.callsign||'');
   if(/^[A-Z0-9]{2,10}$/.test(callsign)){const link=el('a',flight.number||callsign);link.href=`/flights/${callsign}/`;code.append(link);if(flight.number&&flight.number!==callsign)code.append(el('small',callsign));}else code.textContent=flight.number||'Not supplied';
   const destination=el('td','');if(/^[A-Z0-9-]{3,12}$/.test(place||'')){const link=el('a',flight[other]?.city||flight[other]?.name||place);link.href='/airports/?q='+encodeURIComponent(place);destination.append(link);if(flight[other]?.city||flight[other]?.name)destination.append(el('small',place));}else destination.textContent='Not supplied';
   const status=el('span',flight.status||'Not supplied','board-status');status.dataset.status=String(flight.status||'').toLowerCase();const statusCell=el('td','');statusCell.append(status);
   if(airline){
    const aircraft=el('td',flight.aircraftType||'Not supplied');if(flight.registration)aircraft.append(el('small',flight.registration));
    const cells=[code,airportCell(flight.departure),airportCell(flight.arrival),timeCell(flight.departure),timeCell(flight.arrival),aircraft,statusCell];cells.forEach((cell,i)=>cell.dataset.label=['Flight','From','To','Departure (UTC)','Arrival (UTC)','Aircraft','Status'][i]);tr.append(...cells);$('board-rows').append(tr);continue;
   }
   const cells=[when,code,destination,el('td',info.terminal||'Not supplied'),el('td',info.gate||'Not supplied',info.gate?'gate':'gate missing'),statusCell];cells.forEach((cell,i)=>cell.dataset.label=['Time','Flight',direction==='departures'?'Destination':'Origin','Terminal','Gate','Status'][i]);tr.append(...cells);$('board-rows').append(tr);
  }
  $('board-empty').hidden=rows.length>0;$('board-empty').textContent=!data?'Load the board to see available schedules.':query?'No flights match your search.':airline?'No supplied flights match this activity filter. This is a partial view.':'No schedules were supplied for this airport and direction. This does not mean there are no flights.';
  updated(data,rows.length);
  controls();
 }
 function airportCell(info={}){
  const cell=el('td','');if(/^[A-Z0-9-]{3,12}$/.test(info.airport||'')){const link=el('a',info.city||info.name||info.airport);link.href='/airports/?q='+encodeURIComponent(info.airport);cell.append(link);if(info.city||info.name)cell.append(el('small',info.airport));}else cell.textContent='Not supplied';
  cell.append(el('small',`Terminal ${info.terminal||'not supplied'} · Gate ${info.gate||'not supplied'}`));return cell;
 }
 function timeCell(info={}){const cell=el('td',time(info.scheduledAt));if(info.actualAt)cell.append(el('small','Actual '+time(info.actualAt)));else if(info.estimatedAt)cell.append(el('small','Expected '+time(info.estimatedAt)));return cell;}
 function updated(data,count){
  $('board-update').textContent=data?`${count} shown · Updated ${time(data.fetchedAt)}${Date.now()-data.fetchedAt>300000?' · Older results — refresh for updates':''} · Up to 50 supplied flights; coverage may be incomplete.`:'No schedules loaded.';
 }
 function select(tab){direction=tab.dataset.direction;for(const t of tabs){t.setAttribute('aria-selected',String(t===tab));t.tabIndex=t===tab?0:-1;}$('board-panel').setAttribute('aria-labelledby',tab.id);$('board-error').hidden=true;render();}
 for(const tab of tabs){tab.addEventListener('click',()=>select(tab));tab.addEventListener('keydown',e=>{let i=tabs.indexOf(tab);if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();select(tabs[i]);tabs[i].focus();});}
 $('board-search').addEventListener('input',render);
 $('board-refresh').addEventListener('click',async()=>{
  if(busy||!ready)return;const requested=dataKey();busy=true;controls();$('board-error').hidden=true;
  try{const response=await fetch(airline?'/api/premium/airline-schedules':'/api/premium/schedules',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(airline?{airline}:{airport:id,direction:requested}),signal:AbortSignal.timeout(15000)}),data=await response.json();
   if(!response.ok)throw Error(data.error||'Schedules are unavailable. Try again shortly.');
   if((airline?data.airline!==airline:data.airport!==id||data.direction!==requested)||!Array.isArray(data.flights)||!Number.isFinite(data.fetchedAt))throw Error('The schedule response could not be verified.');
   saved.set(requested,data);
  }catch(error){if(dataKey()===requested){$('board-error').textContent=(error.name==='TimeoutError'?'The schedule request timed out.':error.message)+(saved.has(requested)?' Previous rows are retained with their original update time.':'');$('board-error').hidden=false;}}
  finally{busy=false;render();}
 });
 const fullscreen=$('board-fullscreen');fullscreen.disabled=!document.fullscreenEnabled;fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}catch{$('board-error').textContent='Full screen is unavailable in this browser.';$('board-error').hidden=false;}});document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'Exit full screen':'Full screen';});
 async function access(){if(root.dataset.supported==='false'){$('board-access').textContent='Schedule data is unavailable for this airport identifier.';controls();return;}try{const response=await fetch('/api/account',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const account=await response.json();ready=!!account.liveDetailsReady&&!!account.user?.premium;$('board-access').textContent=!account.liveDetailsReady?`Live ${airline?'airline':'airport'} schedules are not available yet.`:!account.user?.premium?`Sign in with Premium to load ${airline?'airline':'airport'} schedules.`:airline?'Load flights, then choose an activity filter.':'Choose a direction, then load its current schedule.';$('board-account').hidden=!account.liveDetailsReady||!!account.user?.premium;}catch{$('board-access').textContent='Unable to check schedule access. Reload this page to retry.';}controls();}
 function tick(){$('board-clock').textContent=clock.format(Date.now());$('board-clock').dateTime=new Date().toISOString();if(airline&&direction==='upcoming')render();else if(saved.has(dataKey()))updated(saved.get(dataKey()),$('board-rows').children.length);}
 tick();setInterval(tick,60000);render();void access();
}
