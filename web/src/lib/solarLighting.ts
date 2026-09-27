import {installNightMap} from './nightMap.ts';
import type * as Cesium from 'cesium';
type Engine=typeof Cesium;
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
/** One scene-wide sun. Each aircraft accounts for Earth's night-side occlusion. */
export function installSolarLighting(C:Engine,v:Cesium.Viewer){
 const disposeNight=installNightMap(C,v);
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
  model.lightColor=new C.CallbackProperty(()=>{const k=amount(entity);return new C.Color(.025+1.975*k,.035+1.965*k,.06+1.94*k,1);},false);
  model.imageBasedLightingFactor=new C.CallbackProperty(()=>{const k=amount(entity);return new C.Cartesian2(.12+.88*k,.06+.94*k);},false);
 };
 const update=()=>{
  if(document.hidden)return;
  const now=Date.now();if(Math.abs(now-updated)>1000){sun=sunDirectionFixed(C,v.clock.currentTime);updated=now;}
  for(const e of v.entities.values)wire(e);
  for(let i=0;i<v.dataSources.length;i++)for(const e of v.dataSources.get(i).entities.values)wire(e);
 };
 const remove=v.scene.preUpdate.addEventListener(update);
 // Keep the terminator moving even when request-render mode is otherwise idle.
 const refresh=()=>{if(!document.hidden&&!v.isDestroyed())v.scene.requestRender();};
 const timer=setInterval(refresh,15000);document.addEventListener('visibilitychange',refresh);refresh();
 return()=>{disposeNight();remove();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
}
