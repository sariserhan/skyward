import test from 'node:test';import assert from 'node:assert/strict';
import {groundSegmentClear,groundRouteClear,aircraftRadius,GroundMotionClock,publishGroundTraffic,forgetGroundTraffic,resetGroundTraffic,updateGroundTraffic} from '../src/lib/groundSafety.ts';
import {arrivalParking} from '../src/lib/arrivalParking.ts';
const p=(x,y=0)=>({lon:x/111120,lat:y/111120});
const building=(x,y,w,h)=>({kind:'terminal',height:12,points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([x,y])=>[x/111120,y/111120])});
const port={id:'TEST',lat:0,lon:0,surfaces:[],paths:[],gates:[],runways:[]};
test('swept aircraft footprint catches walls between clear endpoints and wingtip clipping',()=>{
 const airport={...port,surfaces:[building(50,-10,1,20)]};assert.equal(groundSegmentClear(airport,p(0),p(100),13),false);assert.equal(groundSegmentClear(airport,p(0,40),p(100,40),13),true);assert.equal(groundSegmentClear(airport,p(0,40),p(100,40),48),false);
 assert.equal(groundRouteClear(airport,[p(0),p(40),p(100)],13),false);assert.equal(groundSegmentClear(airport,p(50.5),p(50.5),0),false);
 assert.ok(aircraftRadius('B789')>aircraftRadius('B738'));assert.ok(aircraftRadius('B738')>aircraftRadius('C172'));
});
test('fallback parking refuses an obstructed layout instead of inventing a route through it',()=>{
 const airport={...port,surfaces:[building(-100,-1000,5000,2000)]};assert.equal(arrivalParking(airport,p(0),p(3000)),null);
});
test('ground aircraft brake for separation, hold without passing through, and resume smoothly',()=>{
 resetGroundTraffic();publishGroundTraffic('other',{...p(100),ground:true},13,1000);
 const clock=new GroundMotionClock(),sample=t=>({...p((t-1000)/1000*5),ground:true,groundSpeed:5/.514444});let last;
 for(let i=0;i<250;i++){const now=1000+i*100;publishGroundTraffic('other',{...p(100),ground:true},13,now);const f=clock.advance('self',now,port,13,sample);assert.ok(f.lon*111120<69.01);if(last){assert.ok(f.lon>=last.lon);assert.ok((last.groundSpeed-f.groundSpeed)*.514444<=.201,'braking limited to 2 m/s²');}last=f;}
 assert.equal(last.groundSpeed,0);assert.equal(last.groundHold,'aircraft separation');const stopped=last.lon;
 forgetGroundTraffic('other');for(let i=250;i<350;i++)last=clock.advance('self',1000+i*100,port,13,sample);
 assert.ok(last.lon>stopped);assert.equal(last.groundHold,undefined);resetGroundTraffic();
});
test('large clock gaps cannot tunnel through a building and reported observations remain unchanged',()=>{
 resetGroundTraffic();const airport={...port,surfaces:[building(45,-30,5,60)]},clock=new GroundMotionClock(),sample=t=>({...p((t-1000)/1000*5),ground:true,groundSpeed:5/.514444});
 clock.advance('self',1000,airport,13,sample);const f=clock.advance('self',1000000,airport,13,sample);assert.ok(f.lon*111120<32);
 const observed={hex:'123abc',lat:0,lon:0,ground:true,aircraftType:'B738',observedAt:1000};const before=JSON.stringify(observed);updateGroundTraffic([observed],1000);assert.equal(JSON.stringify(observed),before);resetGroundTraffic();
});
test('an occupied touchdown triggers a continuous airborne circuit instead of landing into traffic',()=>{
 resetGroundTraffic();const clock=new GroundMotionClock(),sample=t=>t<20000?{...p(0),altitude:900,heading:0,ground:false,groundSpeed:130}:{...p(500),altitude:0,heading:0,ground:true,groundSpeed:50};
 publishGroundTraffic('other',{...p(500),ground:true},30,1000);
 let prior=clock.advance('self',1000,port,30,sample);assert.equal(prior.arrivalGoAround,true);
 for(let i=1;i<=1200;i++){const f=clock.advance('self',1000+i*100,port,30,sample);assert.equal(f.ground,false);assert.ok(f.altitude>=899);assert.ok(Math.hypot((f.lon-prior.lon)*111120,(f.lat-prior.lat)*111120)<8);prior=f;}
 assert.ok(Math.hypot(prior.lon*111120,prior.lat*111120)<.01);assert.equal(prior.altitude,900);resetGroundTraffic();
});
test('generated airport traffic keeps building and aircraft clearance over sustained ground motion',async()=>{
 const {readFileSync}=await import('node:fs');const {createSyntheticFleet,syntheticFrame,clearSyntheticTraffic}=await import('../src/lib/syntheticTraffic.ts');
 const airport={...JSON.parse(readFileSync(new URL('../public/data/airports/IAD.json',import.meta.url))),elevationFt:313};resetGroundTraffic();clearSyntheticTraffic();
 const rows=createSyntheticFleet(airport,new Map(),1000);assert.ok(rows.length>0);
 for(let t=1000;t<=91000;t+=500){const frames=rows.map(a=>({a,f:syntheticFrame(a,t)})).filter(({f})=>f.ground);for(const {a,f} of frames)assert.ok(groundSegmentClear(airport,f,f,aircraftRadius(a.aircraftType)),`${a.hex} intersects building at ${t}`);
  for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){const a=frames[i],b=frames[j],x=(a.f.lon-b.f.lon)*111120*Math.cos(airport.lat*Math.PI/180),y=(a.f.lat-b.f.lat)*111120;assert.ok(Math.hypot(x,y)>=aircraftRadius(a.a.aircraftType)+aircraftRadius(b.a.aircraftType),`${a.a.hex}/${b.a.hex} overlap at ${t}`);}}
 clearSyntheticTraffic();resetGroundTraffic();
});
test('a stale UI sample cannot advance the presentation clock twice',()=>{
 resetGroundTraffic();const clock=new GroundMotionClock(),sample=t=>({...p(t/1000),ground:true,groundSpeed:1/.514444});clock.advance('self',1000,port,13,sample);clock.advance('self',2000,port,13,sample);clock.advance('self',1500,port,13,sample);const frame=clock.advance('self',2100,port,13,sample);assert.ok(Math.abs(frame.lon*111120-2.1)<.001);resetGroundTraffic();
});
