import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {operation,operationFrame,trafficFrame,trafficSchedule,journey,journeyFrame,parseDemoSave,serviceVehicles,DEMO_HANDLING,compatibleModel} from '../src/lib/demoOperations.ts';
import {trackDistance} from '../src/lib/positionQuality.ts';
const airport=id=>({...JSON.parse(readFileSync(new URL(`../public/data/airports/${id}.json`,import.meta.url))),elevationFt:JSON.parse(readFileSync(new URL('../data/airport-elevations.json',import.meta.url)))[id]});
test('aircraft-specific operations reach a stand, board, push, taxi, backtrack and take off continuously',()=>{
 for(const model of Object.keys(DEMO_HANDLING)){const op=operation(airport('IAD'),model),phases=new Set();assert.ok(op);let prev;
 for(let t=0;t<=op.end;t+=.5){const f=operationFrame(op,t);phases.add(f.phase);assert.ok(Object.values(f).filter(v=>typeof v==='number').every(Number.isFinite));assert.ok(f.altitude>=op.airport.elevationFt);if(prev){assert.ok(trackDistance(prev,f)<.05,`${model} jump ${t}`);assert.ok(Math.abs(f.altitude-prev.altitude)<30,`${model} height jump ${t}`);}if(f.phase==='landing'||f.ground)assert.equal(f.gear,1);prev=f;}
 for(const phase of ['landing','rollout','taxi in','deboarding','servicing','boarding','pushback','taxi out','runway backtrack','takeoff','climb'])assert.ok(phases.has(phase),`${model} missing ${phase}`);
 assert.equal(serviceVehicles(op,operationFrame(op,op.serviceAt+op.service*.7)).filter(v=>v.show).length,2);
 }
});
test('six aircraft reserve the whole movement area without overlapping ground movements or stands',()=>{
 const ops=Object.keys(DEMO_HANDLING).map((m,i)=>operation(airport('TAS'),m,i));assert.ok(ops.every(Boolean));const schedule=trafficSchedule(ops);
 for(let t=0;t<schedule.period;t+=11){const frames=ops.map((o,i)=>trafficFrame(o,i,t,schedule));assert.ok(frames.filter(f=>f.ground||f.phase==='landing').length<=1);for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){const horizontal=trackDistance(frames[i],frames[j])*1852,vertical=Math.abs(frames[i].altitude-frames[j].altitude)*.3048;assert.ok(Math.hypot(horizontal,vertical)>65,`traffic overlap at ${t}: ${i}/${j}`);}}
 for(let i=0;i<ops.length;i++){assert.ok(trackDistance(trafficFrame(ops[i],i,schedule.period-.01,schedule),trafficFrame(ops[i],i,schedule.period+.01,schedule))<.01);for(let j=i+1;j<ops.length;j++)assert.ok(trackDistance(ops[i].gate,ops[j].gate)*1852>90);}
});
test('complete journeys connect both airports continuously and finish parked at the destination',()=>{
 for(const [a,b,m] of [['IAD','JFK','b737'],['TAS','IST','a320'],['NRT','SFO','b787']]){const j=journey(operation(airport(a),m),operation(airport(b),m));const phases=new Set();let prev;
 for(let t=0;t<=j.end+2;t+=2){const f=journeyFrame(j,t);phases.add(f.phase);assert.ok(Number.isFinite(f.lat)&&Number.isFinite(f.lon)&&Number.isFinite(f.altitude));if(prev){assert.ok(trackDistance(prev,f)<.4,`${a}/${b} jump ${t}`);assert.ok(Math.abs(f.altitude-prev.altitude)<200);}prev=f;}
 assert.ok(phases.has('cruise'));assert.ok(phases.has('landing'));const parked=journeyFrame(j,j.end+10000);assert.equal(parked.phase,'parked at destination');assert.equal(parked.airport,b);assert.equal(parked.groundSpeed,0);assert.ok(trackDistance(parked,j.destination.gate)<.001);
 }
});
test('invalid saved demo sessions and unsuitable aircraft are rejected',()=>{
 const v={version:2,airport:'TAS',seed:7,time:10,journeyTime:50,speed:15,paused:false,flight:'skyward-demo-0',camera:'cockpit',journey:true};assert.deepEqual(parseDemoSave(JSON.stringify(v),'TAS'),v);for(const bad of [{speed:999},{time:-1},{seed:-1},{camera:'bad'},{flight:'real-abc'},{airport:'IAD'},{journeyTime:null}])assert.equal(parseDemoSave(JSON.stringify({...v,...bad}),'TAS'),null);assert.equal(compatibleModel({...airport('TAS'),runways:[]},'b787'),null);
});
