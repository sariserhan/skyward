import test from 'node:test';
import assert from 'node:assert/strict';
import {airportTimeline} from '../src/lib/airportTimeline.ts';
const now=Date.parse('2026-09-28T12:00:00Z'),center={lat:38.947,lon:-77.46};
const aircraft={hex:'abcdef',callsign:'TEST123',targetKind:'aircraft'};
const points=(ground=[false,false,true,true])=>ground.map((ground,i)=>({...center,altitude:ground?300:600,ground,time:now-(3-i)*25000}));
const events=(p,rows=[aircraft])=>airportTimeline(rows,new Map([['abcdef',p]]),center,now);
test('Airport timeline records supported arrival and departure intervals from observed fixes',()=>{
 const arrival=events(points());assert.equal(arrival.length,1);assert.equal(arrival[0].kind,'arrival');assert.equal(arrival[0].time,now-25000);assert.equal(arrival[0].fromTime,now-50000);
 assert.equal(events(points([true,true,false,false]))[0].kind,'departure');
});
test('Airport timeline rejects unconfirmed flags, gaps, impossible jumps, future/old data and non-aircraft',()=>{
 assert.equal(events(points([false,true,false,true])).length,0);
 assert.equal(events(points().slice(0,3)).length,0);
 for(const mutate of [p=>p[2].breakBefore=true,p=>p[3].time=now+5000,p=>p.forEach(v=>v.time-=31*60000),p=>p[0].time-=180000,p=>p[2].lon+=1,p=>p[1].time=p[0].time,p=>p[2].lat=NaN]){const p=points();mutate(p);assert.equal(events(p).length,0);}
 assert.equal(events(points(),[{...aircraft,targetKind:'vehicle'}]).length,0);
 assert.equal(events(points().map(p=>({...p,lat:p.lat+1}))).length,0);
});
