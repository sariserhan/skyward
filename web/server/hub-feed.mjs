import {connect as netConnect} from 'node:net';
import {normalizeAircraft,cameraAreaPath,searchPath} from './feed.mjs';
const number=v=>v!==''&&Number.isFinite(Number(v))?Number(v):null;
export class HubFeed {
 constructor({connect=netConnect,now=Date.now,start=true}={}){this.now=now;this.connect=connect;this.rows=new Map();this.connected=false;this.closed=false;this.retry=1000;if(start)this.start();}
 start(){
  if(this.closed)return;let buffer='';const socket=this.connect({host:'data.adsbhub.org',port:5002});this.socket=socket;socket.setEncoding('utf8');socket.setTimeout(30000);socket.unref?.();
  socket.on('connect',()=>{this.connected=true;this.retry=1000;});
  socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>262144){socket.destroy();return;}let at;while((at=buffer.indexOf('\n'))>=0){this.ingest(buffer.slice(0,at).trim());buffer=buffer.slice(at+1);}});
  socket.on('timeout',()=>socket.destroy());socket.on('error',()=>socket.destroy());socket.on('close',()=>{this.connected=false;if(!this.closed){this.timer=setTimeout(()=>this.start(),this.retry);this.timer.unref?.();this.retry=Math.min(60000,this.retry*2);}});
 }
 ingest(line){
  const v=line.split(',');if(v[0]!=='MSG'||v.length<22||!/^\d$/.test(v[1])||!/^[a-f0-9]{6}$/i.test(v[4]))return;
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(v[6])||!/^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(v[7]))return;
  const stamp=Date.parse(v[6].replaceAll('/','-')+'T'+v[7]+'Z'),now=this.now();if(!Number.isFinite(stamp)||stamp>now+5000||stamp<now-120000)return;
  const hex=v[4].toLowerCase(),old=this.rows.get(hex)??{hex,type:'adsb_icao'},row={...old};
  if(stamp<(old.messageAt??0))return;
  row.messageAt=stamp;
  if(v[10])row.flight=v[10].trim().slice(0,10);
  // A callsign or velocity update must never refresh position time.
  const lat=number(v[14]),lon=number(v[15]);
  if(lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180){row.lat=lat;row.lon=lon;row.positionAt=stamp;row.alt_baro=v[21]==='-1'?'ground':number(v[11]);}
  for(const [field,index] of [['gs',12],['track',13],['baro_rate',16]])if(number(v[index])!==null)row[field]=number(v[index]);
  this.rows.delete(hex);this.rows.set(hex,row);this.lastMessageAt=now;
  for(const [key,a] of this.rows)if(now-a.messageAt>300000)this.rows.delete(key);
  while(this.rows.size>30000)this.rows.delete(this.rows.keys().next().value);
 }
 snapshot(){
  const now=this.now();if(!this.connected||!this.lastMessageAt||now-this.lastMessageAt>30000)throw Error('Additional observation stream unavailable.');
  const aircraft=[];for(const row of this.rows.values()){if(!row.positionAt||now-row.positionAt>120000)continue;const a=normalizeAircraft({...row,seen_pos:Math.max(0,(now-row.positionAt)/1000)},now);if(a)aircraft.push(a);}
  return {source:'ADSBHub',fetchedAt:this.lastMessageAt,sourceAt:this.lastMessageAt,aircraft};
 }
 async cameraArea(lat,lon,radius){cameraAreaPath(lat,lon,radius);const data=this.snapshot(),r=Math.PI/180;return {...data,aircraft:data.aircraft.filter(a=>{const x=Math.sin((a.lat-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(a.lat*r)*Math.sin((a.lon-lon)*r/2)**2;return 6880.13*Math.asin(Math.min(1,Math.sqrt(x)))<=radius;})};}
 async search(kind,query){searchPath(kind,query);const key={hex:'hex',callsign:'callsign',registration:'registration'}[kind],data=this.snapshot();return {...data,aircraft:data.aircraft.filter(a=>a[key]?.toUpperCase()===query.toUpperCase())};}
 close(){this.closed=true;clearTimeout(this.timer);this.socket?.destroy();}
}
