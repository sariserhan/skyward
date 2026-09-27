import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nearestCity} from '../src/lib/cities.ts';
import {fleetProfile,fleetUri,fallbackFleetUri} from '../src/lib/flightPresentation.ts';
const {cities}=JSON.parse(readFileSync(new URL('../public/data/cities.json',import.meta.url)));
test('city reference uses real city coordinates, handles dateline and unknown position',()=>{
 assert.equal(cities.length,1251);for(const c of cities){assert.ok(Math.abs(c.lon)<=180&&Math.abs(c.lat)<=90&&c.name);}
 const london=nearestCity(cities,-.1276,51.5072);assert.equal(london.city.name,'London');assert.ok(london.km<10);
 const seam=nearestCity([{name:'Across dateline',lat:0,lon:-179,country:'Test',rank:1,population:1,capital:false}],179,0);assert.ok(seam.km<225);assert.equal(seam.direction,'W');assert.equal(nearestCity(cities,NaN,0),null);
});
test('distinct Boeing variants and non-airliners map to appropriate profiles; logo textures resolve locally',()=>{
 for(const [type,profile] of [['B38M','b737max'],['B738','b737'],['B752','b757'],['B763','b767'],['A319','a319'],['BCS3','a220'],['C172','light'],['C750','bizjet'],['AT76','turboprop']])assert.equal(fleetProfile(type),profile);
 const file=new URL('../public/'+fallbackFleetUri({aircraftType:'B77W',callsign:'THY123'}),import.meta.url);const model=JSON.parse(readFileSync(file));assert.ok(model.meshes[0].primitives.some(p=>p.attributes.TEXCOORD_0!==undefined));const png=readFileSync(new URL(model.images[0].uri,file));assert.equal(png.subarray(1,4).toString(),'PNG');
});
