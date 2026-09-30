import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {terrainAirports,airportGroundDistance,levelAirportHeight,flattenAirportTile} from '../src/lib/airportTerrain.ts';
import {runwayDatums} from '../src/lib/runwayTerrain.ts';
test('every bundled airport road, gate, building and runway lies on its flat ground footprint',()=>{
 assert.equal(terrainAirports.length,1152);
 for(const a of terrainAirports){
  const geometry=JSON.parse(readFileSync(new URL(`../public/data/airports/${a.id}.json`,import.meta.url)));
  const points=[...(geometry.runways??[]).flatMap(r=>[r.a,r.b]),...(geometry.surfaces??[]).flatMap(s=>s.points),...(geometry.paths??[]).flatMap(p=>p.points),...(geometry.gates??[]).map(g=>g.position)];
  for(const [lon,lat] of points){assert.equal(airportGroundDistance(a,lon,lat),0,a.id);if(a.height!==null)assert.equal(levelAirportHeight(a,lon,lat,3500,20),a.height,a.id);}
 }
});
test('airport terrain flattens apron tile bumps without changing distant mountains or the source buffer',()=>{
 const a=terrainAirports.find(a=>a.id==='IAD'),z=14,n=2**z,x=Math.floor((a.lon+180)/360*n),y=Math.floor((1-Math.log(Math.tan(Math.PI/4+a.lat*Math.PI/360))/Math.PI)/2*n);
 const source=Float32Array.from({length:65*65},(_,i)=>800+i%73),copy=source.slice();
 const flat=flattenAirportTile(source,x,y,z);assert.deepEqual(source,copy);assert.ok(flat.every(h=>Math.abs(h-runwayDatums.get('IAD'))<.001));
 assert.equal(levelAirportHeight(a,a.lon+1,a.lat+1,2840,20),2840);
 assert.equal(flattenAirportTile(source,0,0,3),source);
});
test('airport footprint wrapping stays local across the date line',()=>{
 const a={id:'fixture',lon:179.99,lat:0,west:-.03,east:.03,south:-.03,north:.03,height:0};
 assert.equal(airportGroundDistance(a,-179.99,0),0);assert.ok(airportGroundDistance(a,0,0)>1000000);
});
