export type CalendarJourney={callsign:string;date:string;from?:string;to?:string;summary:string;warning?:string};
const unescape=(s:string)=>s.replace(/\\[nN]/g,' ').replace(/\\([,;\\])/g,'$1');
export function parseJourneyCalendar(input:string):CalendarJourney[]{
 if(new TextEncoder().encode(input).length>256*1024)throw Error('Choose a calendar under 256 KB.');
 const unfolded=input.replace(/\r?\n[ \t]/g,'');if(!/^BEGIN:VCALENDAR\r?$/m.test(unfolded))throw Error('Choose an iCalendar (.ics) file.');
 const events=unfolded.match(/BEGIN:VEVENT\r?\n[\s\S]*?END:VEVENT/g)||[];if(events.length>50)throw Error('Import at most 50 events at a time.');
 return events.flatMap(event=>{
  const values=new Map(event.split(/\r?\n/).flatMap(line=>{const i=line.indexOf(':');return i<0?[]:[[line.slice(0,i),line.slice(i+1)]] as [string,string][];}));
  const start=[...values].find(([k])=>k.split(';')[0]==='DTSTART');if(!start)return [];
  const raw=start[1],date=/^(\d{4})(\d{2})(\d{2})/.exec(raw);if(!date)return [];const day=`${date[1]}-${date[2]}-${date[3]}`;if(!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)return [];
  const summary=unescape(values.get('SUMMARY')||'Imported flight').slice(0,120),text=summary+' '+unescape(values.get('DESCRIPTION')||'');
  const callsign=(values.get('X-SKYWARD-CALLSIGN')||text.match(/\b([A-Z]{3}\d[A-Z0-9]{0,6})\b/)?.[1]||'').toUpperCase();
  const route=text.match(/\b([A-Z]{3,4})\s*(?:→|->| to )\s*([A-Z]{3,4})\b/);
  const warning=(start[0].includes('TZID')||raw.includes('T')&&!raw.endsWith('Z'))?'Local calendar time: confirm the UTC departure date before saving.':values.has('RRULE')?'Recurring event: only this departure date is imported.':undefined;
  return [{callsign,date:day,from:values.get('X-SKYWARD-FROM')||route?.[1]||'',to:values.get('X-SKYWARD-TO')||route?.[2]||'',summary,warning}];
 });
}
const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
export function journeyCalendar(j:{key?:string;callsign:string;date:string;from?:string;to?:string},now=Date.now()){
 const date=j.date.replaceAll('-',''),next=new Date(Date.parse(j.date)+86400000).toISOString().slice(0,10).replaceAll('-','');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Skyward//Saved journeys//EN','BEGIN:VEVENT',`UID:${esc(j.key||j.callsign+':'+j.date)}@skyward.local`,`DTSTAMP:${new Date(now).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${date}`,`DTEND;VALUE=DATE:${next}`,`SUMMARY:${esc(j.callsign+' · '+(j.from||'?')+' → '+(j.to||'?'))}`,'DESCRIPTION:Saved departure date in UTC. Confirm times with your airline. Not a booking confirmation.',`X-SKYWARD-CALLSIGN:${esc(j.callsign)}`,`X-SKYWARD-FROM:${esc(j.from||'')}`,`X-SKYWARD-TO:${esc(j.to||'')}`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
