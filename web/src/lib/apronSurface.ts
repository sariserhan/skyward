import type * as Cesium from 'cesium';
const registered=new WeakSet<object>();
/** Opaque illustrative concrete hides aircraft baked into the aerial photograph. */
export function apronSurfaceMaterial(C:typeof Cesium):Cesium.MaterialProperty {
 if(!registered.has(C.Material)){
  new C.Material({fabric:{type:'SkywardApronSurface',source:`
   czm_material czm_getMaterial(czm_materialInput surface) {
    czm_material m=czm_getDefaultMaterial(surface);
    vec2 uv=surface.st*60.0;
    vec2 edge=min(fract(uv),1.0-fract(uv));
    float seam=1.0-smoothstep(0.0,0.025,min(edge.x,edge.y));
    float slab=fract(sin(dot(floor(uv),vec2(12.9898,78.233)))*43758.5453);
    m.diffuse=vec3(0.43,0.44,0.43)+vec3(slab*0.025-seam*0.035);
    m.alpha=1.0;return m;
   }`},translucent:false});registered.add(C.Material);
 }
 return {isConstant:true,definitionChanged:new C.Event(),getType:()=> 'SkywardApronSurface',getValue:(_time:unknown,result={})=>result,equals(other:unknown){return other===this;}} as Cesium.MaterialProperty;
}
