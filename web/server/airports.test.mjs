import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AIRPORTS,searchAirports,validAirport} from '../src/lib/airportCatalog.ts';
import {parseView,observeAlerts} from '../src/lib/experience.ts';
import {FeedClient} from './feed.mjs';
test('worldwide catalog retains identity and provides well formed detail files',async()=>{
 assert.ok(Object.keys(AIRPORTS).length>300);
 const names=new Set();
 for(const [id,a] of Object.entries(AIRPORTS)){
  assert.match(id,/^[A-Z0-9-]{3,12}$/);assert.ok(!names.has(a.icao));names.add(a.icao);
  assert.ok(Number.isFinite(a.lat)&&Math.abs(a.lat)<=90&&Number.isFinite(a.lon)&&Math.abs(a.lon)<=180);
  const g=JSON.parse(await readFile(new URL(`../public/data/airports/${id}.json`,import.meta.url)));
  assert.equal(g.id,id);assert.ok(g.coverage&&g.source);
  for(const r of g.runways){assert.ok(r.width>0&&r.length>0);for(const pt of [r.a,r.b]){assert.ok(Math.abs(pt[0])<=180&&Math.abs(pt[1])<=90);}}
  assert.equal(g.coverage.gates==='unavailable',g.gates.length===0);
  for(const surface of g.surfaces){assert.ok(surface.points.length>=3);for(const pt of surface.points)assert.ok(pt.every(Number.isFinite)&&Math.abs(pt[0])<=180&&Math.abs(pt[1])<=90);}
  for(const gate of g.gates)assert.ok(gate.position.every(Number.isFinite)&&Math.abs(gate.position[0])<=180&&Math.abs(gate.position[1])<=90);
 }
});
test('airport search supports ICAO, city, country, name and exact IATA ranking',()=>{
 assert.equal(searchAirports('LHR')[0][0],'LHR');
 assert.ok(searchAirports('RJTT').some(([id])=>id==='HND'));
 assert.ok(searchAirports('Sydney').some(([id])=>id==='SYD'));
 assert.ok(searchAirports('Brazil').some(([id])=>id==='GRU'));
 assert.equal(searchAirports('nonexistentairportxyz').length,0);
 for(const id of ['__proto__','constructor','../LHR','toString'])assert.equal(validAirport(id),false);
});
test('worldwide sharing preserves airport and rejects forged facility identities',()=>{
 assert.equal(parseView('#airport=HND&facility=facility-HND-3').facility,'facility-HND-3');
 assert.equal(parseView('#airport=LHR&facility=facility-JFK-3').facility,'');
 assert.equal(parseView('#airport=constructor').airport,'IAD');
});
test('selected-airport requests use validated catalog coordinates with no global polling',async()=>{
 const calls=[];const feed=new FeedClient(async url=>{calls.push(url);return {ok:true,json:async()=>({now:Date.now()/1000,ac:[]})};});
 assert.equal(calls.length,0);await feed.area('HND');
 assert.deepEqual(calls,[`https://api.adsb.lol/v2/point/${AIRPORTS.HND.lat}/${AIRPORTS.HND.lon}/100`]);
 for(const id of ['constructor','UNKNOWN','__proto__'])assert.throws(()=>feed.area(id),/Unknown airport/);
});
test('proximity alerts cover newly supported airports without asserting arrivals',()=>{
 const a={hex:'abcdef',callsign:'TEST',lat:AIRPORTS.SYD.lat,lon:AIRPORTS.SYD.lon-.5,ground:false,altitude:2000,observedAt:100000};
 const first=observeAlerts(undefined,a,100000);
 const next=observeAlerts(first.state,{...a,lon:AIRPORTS.SYD.lon,observedAt:120000},120000);
 assert.ok(next.events.some(e=>e.title.includes('SYD (arrival unconfirmed)')));
});
