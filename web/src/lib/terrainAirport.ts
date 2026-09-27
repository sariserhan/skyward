import type * as Cesium from 'cesium';
import type { AirportGeometry, FacilityTarget } from '../types';
import type { MapPreferences } from './mapPreferences';
export function addTerrainAirport(v:Cesium.Viewer,airport:AirportGeometry,all:FacilityTarget[],prefs:MapPreferences){
  const C=window.Cesium,added:Cesium.Entity[]=[];
  const color=C.Color.fromCssColorString('#b9c6bd');
  let index=airport.runways.length;
  for(const surface of airport.surfaces){
    if(surface.kind==='apron')continue;
    const id=all[index++]?.id;if(!id||surface.points.length<3)continue;
    added.push(v.entities.add({id,show:prefs.structures,polygon:{hierarchy:C.Cartesian3.fromDegreesArray(surface.points.flat()),height:0,heightReference:C.HeightReference.CLAMP_TO_GROUND,extrudedHeight:surface.height,extrudedHeightReference:C.HeightReference.RELATIVE_TO_GROUND,material:color,distanceDisplayCondition:new C.DistanceDisplayCondition(0,50000)}}));
  }
  for(const [i,r] of airport.runways.entries())added.push(v.entities.add({id:all[i].id,show:prefs.labels,polyline:{positions:C.Cartesian3.fromDegreesArray([...r.a,...r.b]),clampToGround:true,width:3,material:C.Color.WHITE.withAlpha(.6)},position:C.Cartesian3.fromDegrees(...r.a),label:{text:r.id,heightReference:C.HeightReference.CLAMP_TO_GROUND,font:prefs.largeLabels?'16px sans-serif':'12px sans-serif',showBackground:true,pixelOffset:new C.Cartesian2(0,-20),distanceDisplayCondition:new C.DistanceDisplayCondition(0,40000)}}));
  for(const [i,g] of airport.gates.entries())added.push(v.entities.add({id:all[index+i]?.id,show:prefs.labels,position:C.Cartesian3.fromDegrees(...g.position),point:{heightReference:C.HeightReference.CLAMP_TO_GROUND,pixelSize:4,color:C.Color.fromCssColorString('#8fdfc8'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)},label:{text:g.label,heightReference:C.HeightReference.CLAMP_TO_GROUND,font:prefs.largeLabels?'15px sans-serif':'11px sans-serif',style:C.LabelStyle.FILL_AND_OUTLINE,outlineColor:C.Color.fromCssColorString('#071723'),outlineWidth:3,pixelOffset:new C.Cartesian2(0,-12),disableDepthTestDistance:Infinity,distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}}));
  return added;
}
