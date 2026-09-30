import {reprojectTerrainTile} from './terrainProjection.ts';
import {flattenAirportTile} from './airportTerrain.ts';
import {qualityEvent} from './qualityEvents.ts';
import type * as Cesium from 'cesium';
// Mapzen/Terrarium open elevation; no key, account, trial, or billable endpoint.
export const TERRAIN_ROOT='https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export function terrariumHeight(r:number,g:number,b:number){return r*256+g+b/256-32768;}
export function createOpenTerrain(failed:()=>void, updated:()=>void) {
  const C=window.Cesium, controller=new AbortController();
  let active=0,disposed=false,reported=false;
  const cache=new Map<string,Float32Array>(),pending=new Map<string,Promise<Float32Array>>();
  const load=(x:number,y:number,z:number,prefetch=false):Promise<Float32Array>|undefined=>{
    const key=`${z}/${x}/${y}`;
    if(cache.has(key))return Promise.resolve(cache.get(key)!);
    if(pending.has(key))return pending.get(key);
    if(active>=(prefetch?4:6)||disposed)return undefined;
    active++;
    const job=(async()=>{
      const response=await fetch(`${TERRAIN_ROOT}/${key}.png`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
      if(!response.ok)throw new Error('Elevation unavailable');
      const bitmap=await createImageBitmap(await response.blob());
      try{
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
        const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Elevation decoding unavailable');
        context.drawImage(bitmap,0,0);const rgba=context.getImageData(0,0,256,256).data;
        const heights=new Float32Array(65*65);
        for(let row=0;row<65;row++)for(let col=0;col<65;col++){
          const px=Math.round(col*255/64),py=Math.round(row*255/64),i=(py*256+px)*4;
          // Imagery depicts sea surface, not the bathymetric sea floor.
          heights[row*65+col]=Math.max(0,terrariumHeight(rgba[i],rgba[i+1],rgba[i+2]));
        }
        const leveled=flattenAirportTile(heights,x,y,z);cache.set(key,leveled);if(cache.size>128)cache.delete(cache.keys().next().value!);return leveled;
      }finally{bitmap.close();}
    })().catch(error=>{if(!disposed&&!reported&&!prefetch){reported=true;qualityEvent('terrain','failed','Some elevation tiles unavailable; retaining loaded terrain');failed();}
      // Cesium upsamples failed child tiles from their loaded parent. A flat root
      // keeps the globe drawable when even the lowest-resolution tile is unavailable.
      if(z===0)return new Float32Array(65*65);throw error;}).finally(()=>{active--;pending.delete(key);if(!disposed)updated();});
    pending.set(key,job);return job;
  };
  // Geographic geometry reaches ±90°. Mercator terrain leaves both polar caps open.
  const geographic=new Map<string,Promise<Float32Array>>();let projecting=0;
  const globeTile=(x:number,y:number,z:number)=>{
    const key=`${z}/${x}/${y}`;
    if(disposed)return undefined;
    if(geographic.has(key))return geographic.get(key);
    if(projecting>=2)return undefined;
    projecting++;
    const job=reprojectTerrainTile(x,y,z,async(sx,sy,sz)=>{
      const tile=load(sx,sy,sz);if(!tile)throw new Error('Terrain request deferred');return tile;
    }).catch(error=>{geographic.delete(key);throw error;}).finally(()=>{projecting--;});
    geographic.set(key,job);if(geographic.size>128)geographic.delete(geographic.keys().next().value!);
    return job;
  };
  const provider=new C.CustomHeightmapTerrainProvider({width:65,height:65,tilingScheme:new C.GeographicTilingScheme(),callback:globeTile,
    credit:new C.Credit(`<a href="${(import.meta.env?.BASE_URL??'/')}terrain-attribution.txt" target="_blank">Open terrain: Mapzen · USGS · NOAA · other contributors</a>`,true)});
  provider.requestTileGeometry=(x,y,level)=>{
    const heights=globeTile(x,y,level);if(!heights)return undefined;
    return heights.then(buffer=>new C.HeightmapTerrainData({buffer,width:65,height:65,childTileMask:level>=14?0:15}));
  };
  const retries=new Map<string,number>();
  const removeError=provider.errorEvent.addEventListener((error:{x:number;y:number;level:number;retry:boolean})=>{
    const key=`${error.level}/${error.x}/${error.y}`,attempt=retries.get(key)??0;
    error.retry=!disposed&&attempt<2;retries.set(key,attempt+1);
    if(retries.size>512)retries.delete(retries.keys().next().value!);
  });
  return {provider:provider as Cesium.TerrainProvider,warm:(lon:number,lat:number)=>{
    if(active>2||disposed||!Number.isFinite(lon)||!Number.isFinite(lat))return;
    const scheme=new C.WebMercatorTilingScheme(),point=C.Cartographic.fromDegrees(lon,Math.max(-85,Math.min(85,lat)));
    for(const z of [9,11]){const tile=scheme.positionToTileXY(point,z);if(tile)void load(tile.x,tile.y,z,true)?.catch(()=>{});}
  },dispose:()=>{disposed=true;controller.abort();removeError();cache.clear();geographic.clear();retries.clear();}};
}
