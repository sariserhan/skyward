const seen=new Set<string>();
export function travelMetric(event:'premium_view'|'trip_start'|'trip_saved'|'sharing_created'|'guest_watch'|'client_script_error'|'client_render_error'|'client_cockpit_error'|'client_feed_error'|'client_account_error'){
 if(seen.has(event)||navigator.doNotTrack==='1')return;seen.add(event);
 void fetch('/api/travel-metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event}),credentials:'omit',keepalive:true}).catch(()=>{});
}
