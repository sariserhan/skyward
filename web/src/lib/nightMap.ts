import type * as Cesium from 'cesium';
const nightLayers=new WeakSet<Cesium.ImageryLayer>();
export function hasBaseImagery(v:Cesium.Viewer){for(let i=0;i<v.imageryLayers.length;i++)if(!nightLayers.has(v.imageryLayers.get(i)))return true;return false;}
/** Lift night-side surface detail without brightening the sky or the daylight hemisphere. */
export const nightReadabilityShader=`
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform sampler2D cityLights;
uniform float cityLightStrength;
in vec2 v_textureCoordinates;
void main(){
 vec4 color=texture(colorTexture,v_textureCoordinates);
 // Aircraft keep their own solar/material lighting across the horizon.
 // Selection uses Cesium's visible-fragment ID buffer, so terrain occlusion
 // and gaps between wings/gear remain correct (no screen-space cutout).
 #ifdef CZM_SELECTED_FEATURE
 if(czm_selected()){out_FragColor=color;return;}
 #endif
 // Post-process depthTexture is a depth component, not RGBA-packed globe depth.
 float depth=texture(depthTexture,v_textureCoordinates).r;
 if(depth<=0.0||depth>=1.0){out_FragColor=color;return;}
 // Normalized screen coordinates remain correct at every resolutionScale.
 vec4 eye=czm_windowToEyeCoordinates(v_textureCoordinates*czm_viewport.zw+czm_viewport.xy,depth);
 vec3 world=(czm_inverseView*vec4(eye.xyz/eye.w,1.0)).xyz;
 // For the globe, intersect the camera ray with the fixed WGS84 ellipsoid.
 // This avoids multi-frustum/log-depth reconstruction drift at space distances.
 if(czm_sceneMode==czm_sceneMode3D){
  vec3 directionEC=normalize((czm_inverseProjection*vec4(v_textureCoordinates*2.0-1.0,-1.0,1.0)).xyz);
  vec3 directionWC=normalize(mat3(czm_inverseView)*directionEC);
  vec3 origin=czm_viewerPositionWC*czm_ellipsoidInverseRadii;
  vec3 direction=directionWC*czm_ellipsoidInverseRadii;
  float a=dot(direction,direction),b=dot(origin,direction),c=dot(origin,origin)-1.0;
  float discriminant=b*b-a*c;
  if(discriminant<0.0){out_FragColor=color;return;}
  float distanceToGround=(-b-sqrt(discriminant))/a;
  world=czm_viewerPositionWC+directionWC*distanceToGround;
 }
 vec3 normal=normalize(world*czm_ellipsoidInverseRadii*czm_ellipsoidInverseRadii);
 if(czm_sceneMode==czm_sceneMode2D||czm_sceneMode==czm_sceneModeColumbusView){
  float lon=world.y/czm_ellipsoidRadii.x,lat=world.z/czm_ellipsoidRadii.x;
  normal=vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));
 }
 float night=1.0-smoothstep(-0.10,0.06,dot(normal,czm_sunDirectionWC));
 vec3 readable=pow(max(color.rgb,vec3(0.0)),vec3(0.55));
 vec2 uv=vec2(atan(normal.y,normal.x)/czm_twoPi+0.5,asin(normal.z)/czm_pi+0.5);
 vec3 urban=texture(cityLights,uv).rgb;
 float glow=smoothstep(0.18,0.65,max(urban.r,max(urban.g,urban.b)));
 vec3 emission=urban*glow*night*cityLightStrength*1.6;
 out_FragColor=vec4(min(vec3(1.0),mix(color.rgb,readable,night)+emission),color.a);
}`;
export function installNightMap(C:typeof Cesium,v:Cesium.Viewer){
 const stage=v.scene.postProcessStages.add(new C.PostProcessStage({name:'skyward-night-readability',fragmentShader:nightReadabilityShader,uniforms:{cityLights:`${import.meta.env.BASE_URL}data/night-lights/black-marble-2016.jpg`,cityLightStrength:()=>{const t=Math.max(0,Math.min(1,(v.camera.positionCartographic.height-300_000)/1_700_000));return t*t*(3-2*t);}}}));
 // Restrict the ID mask to nearby visible aircraft, not the entire fleet.
 // Preserve array identity when unchanged to avoid shader/texture rebuilds.
 let protectedModels:Cesium.Model[]=[];
 const maskAircraft=()=>{
  const models:Cesium.Model[]=[];
  const visit=(primitives:Cesium.PrimitiveCollection)=>{for(let i=0;i<primitives.length;i++){
   const primitive=primitives.get(i);
   if(primitive instanceof C.PrimitiveCollection){visit(primitive);continue;}
   if(!(primitive instanceof C.Model)||!primitive.ready||!primitive.show)continue;
   const id=typeof primitive.id==='string'?primitive.id:primitive.id?.id;
   if(typeof id!=='string'||!(id.startsWith('aircraft-')||id==='flight-simulation'))continue;
   if(C.Cartesian3.distance(v.camera.positionWC,primitive.boundingSphere.center)<5000)models.push(primitive);
  }};
  visit(v.scene.primitives);
  models.sort((a,b)=>C.Cartesian3.distanceSquared(v.camera.positionWC,a.boundingSphere.center)-C.Cartesian3.distanceSquared(v.camera.positionWC,b.boundingSphere.center));
  models.length=Math.min(models.length,8);
  if(models.length!==protectedModels.length||models.some(m=>!protectedModels.includes(m))){protectedModels=models;(stage as {selected?:Cesium.Model[]}).selected=models.length?models:undefined;}
 };
 const removeMask=v.scene.preRender.addEventListener(maskAircraft);
 let active=true,layer:Cesium.ImageryLayer|undefined;
 const place=()=>{if(!layer)return;if(v.imageryLayers.contains(layer))v.imageryLayers.raiseToTop(layer);else if(hasBaseImagery(v))v.imageryLayers.add(layer);};
 // This global composite resolves roughly 11 km per pixel at the equator.
 // Fade before those pixels cover close-up terrain; never veil flight views.
 const updateDetail=()=>{if(!layer)return;const height=v.camera.positionCartographic.height;
  const t=Math.max(0,Math.min(1,(height-300_000)/1_700_000));
  layer.alpha=t*t*(3-2*t);
 };
 const onFrame=v.scene.preRender.addEventListener(updateDetail);
 const onLayer=v.imageryLayers.layerAdded.addEventListener(place);
 const credit=new C.Credit('<a href="https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/" target="_blank" rel="noreferrer">Night lights: NASA Black Marble 2016 · historical composite</a>',false);
 void C.SingleTileImageryProvider.fromUrl(`${import.meta.env.BASE_URL}data/night-lights/black-marble-2016.jpg`,{credit}).then(provider=>{
  if(!active||v.isDestroyed())return;
  layer=new C.ImageryLayer(provider,{dayAlpha:0,nightAlpha:.62,brightness:2.0,contrast:1.1});
  nightLayers.add(layer);updateDetail();place();v.scene.requestRender();
 }).catch(()=>{/* Local texture unavailable: retain the readable base map. */});
 return()=>{active=false;removeMask();onFrame();onLayer();if(!v.isDestroyed()){v.scene.postProcessStages.remove(stage);if(layer&&v.imageryLayers.contains(layer))v.imageryLayers.remove(layer,true);}};
}
