import {skyObscuration} from './weatherSky.ts';
import {installNightMap} from './nightMap.ts';
import type * as Cesium from 'cesium';
type Engine=typeof Cesium;
const clarityViews=new WeakSet<Cesium.Viewer>();
export function setTowerClarity(viewer:Cesium.Viewer,enabled:boolean){if(enabled)clarityViews.add(viewer);else clarityViews.delete(viewer);if(!viewer.isDestroyed())viewer.scene.requestRender();}
/** Use the same ephemeris and Earth-fixed transform as Cesium's SunLight. */
export function sunDirectionFixed(C:Engine,time:Cesium.JulianDate){
 const sun=C.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time);
 const rotation=C.Transforms.computeIcrfToCentralBodyFixedMatrix(time,new C.Matrix3())??C.Transforms.computeTemeToPseudoFixedMatrix(time,new C.Matrix3());
 return C.Cartesian3.normalize(C.Matrix3.multiplyByVector(rotation,sun,new C.Cartesian3()),new C.Cartesian3());
}
/** Smooth civil twilight; altitude extends visibility of the sun above the surface horizon. */
export function sunlightAmount(elevationDegrees:number,altitude=0){
 const dip=Math.acos(6371000/(6371000+Math.max(0,Number.isFinite(altitude)?altitude:0)))*180/Math.PI;
 const t=Math.max(0,Math.min(1,(elevationDegrees+dip+6)/8));return t*t*(3-2*t);
}
export function solarElevation(C:Engine,position:Cesium.Cartesian3,sun:Cesium.Cartesian3){
 const normal=C.Ellipsoid.WGS84.geodeticSurfaceNormal(position,new C.Cartesian3());
 return Math.asin(Math.max(-1,Math.min(1,C.Cartesian3.dot(normal,sun))))*180/Math.PI;
}
/** Keep readable ambient light while direct sunlight warms near the horizon. */
export function aircraftSunColor(elevation:number,altitude=0,cover=0,clarity=false){
 const k=Math.max(clarity?.35:0,sunlightAmount(elevation,altitude));
 const warmth=Math.max(0,Math.min(1,(15-elevation)/15))*k;
 const direct=(1-.65*Math.max(0,Math.min(1,cover)))*k;
 return [.025+1.975*direct,.035+(1.965-.45*warmth)*direct,.06+(1.94-.85*warmth)*direct];
}
/** One scene-wide sun. Each aircraft accounts for Earth's night-side occlusion. */
export function installSolarLighting(C:Engine,v:Cesium.Viewer){
 const disposeNight=installNightMap(C,v);
 // Conservative clearcoat-like response for legacy matte paint. Preserve dark
 // rubber/glass, transparent parts, metals and already-authored roughness.
 const paintShader=new C.CustomShader({uniforms:{u_aircraftSun:{type:C.UniformType.VEC3,value:sunDirectionFixed(C,v.clock.currentTime)}},fragmentShaderText:`void fragmentMain(FragmentInput fsInput,inout czm_modelMaterial material){
  float paint=smoothstep(.25,.55,max(material.diffuse.r,max(material.diffuse.g,material.diffuse.b)));
  // Keep broad tail faces readable in side view as well as grazing edges.
  // The cool fill has a small floor so very dark liveries retain a silhouette.
  vec3 worldPosition=fsInput.attributes.positionWC;
  vec3 earthNormal=normalize(worldPosition/vec3(6378137.0*6378137.0,6378137.0*6378137.0,6356752.3*6356752.3));
  float elevation=asin(clamp(dot(earthNormal,u_aircraftSun),-1.0,1.0));
  float height=max(0.0,length(worldPosition)-length(normalize(worldPosition)*vec3(6378137.0,6378137.0,6356752.3)));
  float horizonDip=acos(6371000.0/(6371000.0+height));
  float night=1.0-smoothstep(radians(-6.0),radians(2.0),elevation+horizonDip);
  float facing=abs(dot(normalize(fsInput.attributes.normalEC),normalize(-fsInput.attributes.positionEC)));
  float rim=pow(1.0-facing,3.0);
  vec3 faceFill=vec3(.012,.018,.028)*(.4+.6*facing*facing);
  if(material.alpha>.98){material.emissive+=night*(material.diffuse*vec3(.055,.065,.085)+faceFill+vec3(.018,.026,.042)*rim);}
  if(material.alpha>.98&&max(material.specular.r,max(material.specular.g,material.specular.b))<.1&&material.roughness>.85){material.roughness=mix(material.roughness,.46,paint);}
 }`});
 const globe=v.scene.globe;v.clock.clockStep=C.ClockStep.SYSTEM_CLOCK;v.clock.shouldAnimate=true;
 v.scene.light=new C.SunLight();globe.enableLighting=true;
 globe.dynamicAtmosphereLighting=true;globe.dynamicAtmosphereLightingFromSun=true;
 // Cesium's defaults restore daylight when zooming close to the ground.
 globe.lightingFadeOutDistance=0;globe.lightingFadeInDistance=1;
 globe.nightFadeOutDistance=0;globe.nightFadeInDistance=1;
 v.scene.atmosphere.dynamicLighting=C.DynamicAtmosphereLightingType.SUNLIGHT;
 if(v.scene.skyAtmosphere)v.scene.skyAtmosphere.show=true;
 let sun=sunDirectionFixed(C,v.clock.currentTime),updated=0;const wired=new WeakSet<Cesium.ModelGraphics>();
 const amount=(entity:Cesium.Entity)=>{const position=entity.position?.getValue(v.clock.currentTime);if(!position)return 1;return sunlightAmount(solarElevation(C,position,sun),C.Cartographic.fromCartesian(position).height);};
 const wire=(entity:Cesium.Entity)=>{
  const model=entity.model;if(!model||wired.has(model))return;wired.add(model);
  if((entity.id.startsWith('aircraft-')||entity.id==='flight-simulation')&&!model.customShader)model.customShader=new C.ConstantProperty(paintShader);
  model.environmentMapOptions=new C.PropertyBag({maximumSecondsDifference:120,maximumPositionEpsilon:2000,mipmapLevels:6,groundAlbedo:.25,
   saturation:new C.CallbackProperty(()=>1-.45*skyObscuration(v),false)});
  model.lightColor=new C.CallbackProperty(()=>{
   const position=entity.position?.getValue(v.clock.currentTime);if(!position)return C.Color.WHITE;
   // Weather is local to the watched scene: don't dim distant aircraft globally.
   const local=C.Cartesian3.distance(position,v.camera.positionWC)<20000;
   const rgb=aircraftSunColor(solarElevation(C,position,sun),C.Cartographic.fromCartesian(position).height,local?skyObscuration(v):0,clarityViews.has(v));
   return new C.Color(rgb[0],rgb[1],rgb[2],1);
  },false);
  model.imageBasedLightingFactor=new C.CallbackProperty(()=>{const k=Math.max(clarityViews.has(v)?.5:0,amount(entity));return new C.Cartesian2(.12+.88*k,.06+.94*k);},false);
 };
 const update=()=>{
  if(document.hidden)return;
  const now=Date.now();if(Math.abs(now-updated)>1000){sun=sunDirectionFixed(C,v.clock.currentTime);paintShader.setUniform('u_aircraftSun',sun);updated=now;}
  for(const e of v.entities.values)wire(e);
  for(let i=0;i<v.dataSources.length;i++)for(const e of v.dataSources.get(i).entities.values)wire(e);
 };
 const remove=v.scene.preUpdate.addEventListener(update);
 // Keep the terminator moving even when request-render mode is otherwise idle.
 const refresh=()=>{if(!document.hidden&&!v.isDestroyed())v.scene.requestRender();};
 const timer=setInterval(refresh,15000);document.addEventListener('visibilitychange',refresh);refresh();
 return()=>{if(!v.isDestroyed())for(const e of v.entities.values)if(e.model?.customShader?.getValue(v.clock.currentTime)===paintShader)e.model.customShader=undefined;paintShader.destroy();disposeNight();remove();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
}
