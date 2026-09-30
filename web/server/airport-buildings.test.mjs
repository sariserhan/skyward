import test from 'node:test';import assert from 'node:assert/strict';
import {airportBuildingHeight,airport3DTarget} from '../src/lib/airportBuildings.ts';
test('airport surfaces preserve building heights and never turn aprons into buildings',()=>{
 for(const height of [0,12,NaN])assert.equal(airportBuildingHeight({kind:'apron',height}),undefined);
 assert.equal(airportBuildingHeight({kind:'terminal',height:22}),22);
 assert.equal(airportBuildingHeight({kind:'building',height:NaN}),8);
 assert.equal(airportBuildingHeight({kind:'terminal',height:0}),12);
});
test('3D airport framing centers on terminals and handles missing footprints and dateline',()=>{
 const airport={id:'TEST',lat:10,lon:179.99,surfaces:[]};
 assert.equal(airport3DTarget(airport).range,7000);
 airport.surfaces=[{kind:'terminal',points:[[179.99,10],[-179.99,10],[-179.99,10.01]],height:12},{kind:'apron',points:[[0,0],[1,1],[2,2]],height:0}];
 const target=airport3DTarget(airport);assert.ok(Math.abs(target.lon)>179.9);assert.ok(target.range<5000);assert.ok(Math.abs(target.lat-10.005)<1e-6);
});

test('airport polygon hierarchy preserves courtyard voids',async()=>{
 const {airportPolygonHierarchy}=await import('../src/lib/airportBuildings.ts');
 const C={Cartesian3:{fromDegreesArray:x=>x},PolygonHierarchy:class {constructor(positions,holes=[]){this.positions=positions;this.holes=holes;}}};
 const s={points:[[0,0],[5,0],[5,5],[0,5],[0,0]],holes:[[[1,1],[2,1],[2,2],[1,2],[1,1]]]};
 const h=airportPolygonHierarchy(C,s);assert.deepEqual(h.positions,s.points.flat());assert.deepEqual(h.holes[0].positions,s.holes[0].flat());
 assert.equal(airportPolygonHierarchy(C,{points:s.points}).holes.length,0);
});
test('courtyards are not occupied by terminal solid footprint',async()=>{
 const {insideSurface}=await import('../src/lib/airportScenery.ts');
 const s={points:[[0,0],[5,0],[5,5],[0,5],[0,0]],holes:[[[1,1],[2,1],[2,2],[1,2],[1,1]]]};
 assert.equal(insideSurface([1.5,1.5],s),false);assert.equal(insideSurface([3,3],s),true);
});

test('imported TAS courtyard produces valid real Cesium geometry',async()=>{
 const C=await import('cesium');
 const {readFile}=await import('node:fs/promises');
 const {airportPolygonHierarchy}=await import('../src/lib/airportBuildings.ts');
 const airport=JSON.parse(await readFile(new URL('../public/data/airports/TAS.json',import.meta.url)));
 const surface=airport.surfaces.find(s=>s.holes?.length);
 assert.ok(surface,'TAS sample must exercise a real imported courtyard');
 const hierarchy=airportPolygonHierarchy(C,surface);
 assert.equal(hierarchy.holes.length,surface.holes.length);
 const geometry=C.PolygonGeometry.createGeometry(new C.PolygonGeometry({polygonHierarchy:hierarchy,height:0,extrudedHeight:surface.height}));
 assert.ok(geometry.indices.length>0);assert.ok([...geometry.attributes.position.values].every(Number.isFinite));
});
