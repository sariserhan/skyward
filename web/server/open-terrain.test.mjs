import test from 'node:test';import assert from 'node:assert/strict';
import {createOpenTerrain} from '../src/lib/openTerrain.ts';
test('terrain failures reject children for parent upsampling, retry locally, and retain cached neighboring terrain',async()=>{
 const originals={window:globalThis.window,fetch:globalThis.fetch,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
 const listeners=[];let failures=0,requests=0;
 class Provider{errorEvent={addEventListener(fn){listeners.push(fn);return()=>listeners.splice(listeners.indexOf(fn),1);}};}
 globalThis.window={Cesium:{CustomHeightmapTerrainProvider:Provider,WebMercatorTilingScheme:class{},Credit:class{},HeightmapTerrainData:class{constructor(options){Object.assign(this,options);}}}};
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(256*256*4).fill(128)})})})};
 globalThis.createImageBitmap=async()=>({close(){}});
 globalThis.fetch=async url=>{requests++;if(url.includes('/2/1/1')||url.includes('/terrarium/0/'))throw Error('fixture failure');return {ok:true,blob:async()=>new Blob()};};
 const terrain=createOpenTerrain(()=>failures++,()=>{});
 try{
  const good=await terrain.provider.requestTileGeometry(0,0,2);assert.ok(good.buffer[0]>0);
  await assert.rejects(terrain.provider.requestTileGeometry(1,1,2),/fixture/);
  const before=requests;assert.equal((await terrain.provider.requestTileGeometry(0,0,2)).buffer,good.buffer);assert.equal(requests,before);assert.equal(failures,1);
  const root=await terrain.provider.requestTileGeometry(0,0,0);assert.equal(root.buffer[0],0);
  for(const retry of [true,true,false]){const event={x:1,y:1,level:2,retry:false};listeners[0](event);assert.equal(event.retry,retry);}
  const other={x:2,y:2,level:2,retry:false};listeners[0](other);assert.equal(other.retry,true);
  assert.equal((await terrain.provider.requestTileGeometry(0,0,14)).childTileMask,0);
  terrain.dispose();assert.equal(listeners.length,0);assert.equal(terrain.provider.requestTileGeometry(9,9,9),undefined);
 }finally{terrain.dispose();for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
