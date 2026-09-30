import test from 'node:test';import assert from 'node:assert/strict';
import {reprojectTerrainTile} from '../src/lib/terrainProjection.ts';
test('geographic terrain closes both poles and preserves elevation away from caps',async()=>{
 const load=async(x,y,z)=>{assert.ok(x>=0&&x<2**z&&y>=0&&y<2**z);return new Float32Array(65*65).fill(1000);};
 const north=await reprojectTerrainTile(0,0,0,load);
 assert.equal(north[0],0);assert.equal(north[64*65],0);assert.equal(north[32*65],1000);assert.ok([...north].every(Number.isFinite));
 const northZoom=await reprojectTerrainTile(0,0,8,()=>{throw Error('Polar tiles must not fetch Mercator data');});assert.ok([...northZoom].every(v=>v===0));
 const southZoom=await reprojectTerrainTile(0,255,8,()=>{throw Error('Polar tiles must not fetch Mercator data');});assert.ok([...southZoom].every(v=>v===0));
});
test('neighboring geographic tiles share continuous boundaries',async()=>{
 const load=async(x,y,z)=>Float32Array.from({length:65*65},(_,i)=>(x+ i%65/64)*100+(y+Math.floor(i/65)/64)*10);
 const left=await reprojectTerrainTile(2,2,3,load),right=await reprojectTerrainTile(3,2,3,load),below=await reprojectTerrainTile(2,3,3,load);
 for(let i=0;i<65;i++){assert.equal(left[i*65+64],right[i*65]);assert.equal(left[64*65+i],below[i]);}
});
