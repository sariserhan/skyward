import type * as Cesium from 'cesium';

/** Geographic, pole-to-pole imagery must be the base: Cesium stretches a base
 * layer's edges outside its extent, which distorts Mercator imagery at ±85°.
 * Natural Earth II is already bundled with Cesium; no extra remote provider.
 */
export function createGlobalBasemap(C:typeof Cesium,baseUrl:string){
 return new C.UrlTemplateImageryProvider({
  url:`${baseUrl}cesium/Assets/Textures/NaturalEarthII/{z}/{x}/{reverseY}.jpg`,
  tilingScheme:new C.GeographicTilingScheme(),
  rectangle:C.Rectangle.MAX_VALUE,
  minimumLevel:0,maximumLevel:2,
  credit:new C.Credit('Natural Earth II · reference imagery',false),
 });
}
