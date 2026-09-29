import {EventEmitter} from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CombinedFeed,configuredFeed,mergeFeeds} from './combined-feed.mjs';
import {HubFeed} from './hub-feed.mjs';
const now=Date.now(),a={hex:'abcdef',lat:40,lon:33,observedAt:now-10000,ground:false,registration:'A1',aircraftType:'A320'};
const result=rows=>({aircraft:rows,fetchedAt:now,sourceAt:now,source:'fixture'});
test('merge deduplicates by hex, keeps newer complete fixes and excludes impossible jumps',()=>{
 const second={...a,lon:33.01,observedAt:now,registration:'',aircraftType:''};
 const m=mergeFeeds([{id:'one',data:result([a])},{id:'two',data:result([second])}],now);
 assert.equal(m.aircraft.length,1);assert.equal(m.aircraft[0].lon,second.lon);assert.equal(m.aircraft[0].observedAt,now);assert.equal(m.aircraft[0].aircraftType,'A320');assert.equal(m.aircraft[0].positionSource,'two');
 const conflict=mergeFeeds([{id:'one',data:result([a])},{id:'two',data:result([{...second,lon:-77}])}],now).aircraft[0];assert.equal(conflict.lon,a.lon);assert.match(conflict.positionWarning,/Conflicting/);
});
test('stale, future and missing-position fixes never replace recent positions',()=>{
 const m=mergeFeeds([{id:'one',data:result([a])},{id:'two',data:result([{...a,observedAt:now+90000},{...a,hex:'bbbbbb',observedAt:now-400000},{...a,lat:null,lon:null,observedAt:null}])}],now);assert.deepEqual(m.aircraft.map(x=>x.hex),['abcdef']);assert.equal(m.aircraft[0].observedAt,a.observedAt);
});
test('additional sources cover all area and search queries, including primary failure',async()=>{
 const calls=[],primary={cameraArea:async()=>{throw Error('down');},search:async()=>{throw Error('down');}},secondary={cameraArea:async(...args)=>{calls.push(args);return result([a]);},search:async(...args)=>{calls.push(args);return result([a]);}};
 const f=new CombinedFeed(primary,[{id:'extra',client:secondary}]);assert.equal((await f.cameraArea(40,33,25)).aircraft.length,1);assert.equal((await f.search('hex','abcdef')).partial,true);assert.equal(calls.length,2);assert.equal(f.sources[0].available,false);
 await assert.rejects(new CombinedFeed(primary).cameraArea(40,33,25),/down/);
});
test('no additional connections without explicit access; paid endpoints are absent',async()=>{
 let calls=0;const f=configuredFeed({env:{},fetchImpl:async url=>{calls++;assert.ok(String(url).startsWith('https://api.adsb.lol/'));return {ok:true,json:async()=>({ac:[],now:Date.now()})};},connect:()=>{throw Error('must not connect');}});assert.equal(f.sources.length,1);await f.area('ESB');assert.equal(calls,1);
 assert.throws(()=>configuredFeed({env:{SKYWARD_ADSBFI_ENABLED:'1'}}),/permission/);assert.throws(()=>configuredFeed({env:{SKYWARD_ADSBHUB_ENABLED:'1'}}),/access/);
});
test('permission-enabled adapter uses documented endpoint, merges and retains cache age',async()=>{
 const urls=[];const f=configuredFeed({env:{SKYWARD_ADSBFI_ENABLED:'1',SKYWARD_ADSBFI_COMMERCIAL_PERMISSION:'confirmed'},fetchImpl:async url=>{urls.push(String(url));return {ok:true,json:async()=>({ac:[],now:Date.now()})};}});
 await f.cameraArea(40,33,25);await f.cameraArea(40,33,25);assert.equal(urls.length,2);assert.ok(urls.some(u=>u.includes('opendata.adsb.fi/api/v3/lat/40/lon/33/dist/50')));
});
function line(t,{lat='40',lon='33',callsign='THY7',ground='0',alt='30000'}={}){const v=Array(22).fill('');v[0]='MSG';v[1]='3';v[4]='ABCDEF';v[6]=new Date(t).toISOString().slice(0,10).replaceAll('-','/');v[7]=new Date(t).toISOString().slice(11,23);v[10]=callsign;v[11]=alt;v[14]=lat;v[15]=lon;v[21]=ground;return v.join(',');}
test('stream timestamps reflect position messages only, and outages are not empty successes',async()=>{
 const h=new HubFeed({start:false,now:()=>now});h.connected=true;h.ingest(line(now-10000));h.ingest(line(now,{lat:'',lon:'',callsign:'THY8'}));const r=await h.cameraArea(40,33,25);assert.equal(r.aircraft[0].callsign,'THY8');assert.equal(r.aircraft[0].observedAt,now-10000);h.connected=false;await assert.rejects(h.cameraArea(40,33,25));h.close();
});
test('stream rejects invalid timestamps and coordinates and preserves zero values',()=>{
 const h=new HubFeed({start:false,now:()=>now});h.connected=true;h.ingest(line(now-500000));assert.equal(h.rows.size,0);h.ingest(line(now,{lat:'0',lon:'0',ground:'-1',alt:'0'}));const a=h.snapshot().aircraft[0];assert.equal(a.lat,0);assert.equal(a.altitude,0);assert.equal(a.ground,true);h.close();
});

test('stream connects only to the fixed endpoint, handles split lines and closes cleanly',()=>{
 const socket=new EventEmitter();socket.setEncoding=()=>{};socket.setTimeout=()=>{};socket.unref=()=>{};let destroyed=false;socket.destroy=()=>{destroyed=true;socket.emit('close');};
 const h=new HubFeed({now:()=>now,connect:options=>{assert.deepEqual(options,{host:'data.adsbhub.org',port:5002});return socket;}});
 socket.emit('connect');const message=line(now)+'\n';socket.emit('data',message.slice(0,12));assert.equal(h.rows.size,0);socket.emit('data',message.slice(12));assert.equal(h.snapshot().aircraft.length,1);assert.equal(h.snapshot().aircraft[0].targetKind,'unknown');h.close();assert.equal(destroyed,true);assert.equal(h.connected,false);assert.equal(h.timer,undefined);
});
