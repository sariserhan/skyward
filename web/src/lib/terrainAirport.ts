import {runwayDatums} from './runwayTerrain';
import {runwayDatum} from './runwayDatum';
import {runwaySurfaceCorners} from './runwaySurface';
import {buildingMaterial} from './buildingAppearance';
import {airportBuildingHeight,airportPolygonHierarchy} from './airportBuildings';
import type * as Cesium from 'cesium';
import type { AirportGeometry, FacilityTarget } from '../types';
import type { MapPreferences } from './mapPreferences';
export function addTerrainAirport(v:Cesium.Viewer,airport:AirportGeometry,all:FacilityTarget[],prefs:MapPreferences){
  const C=window.Cesium,added:Cesium.Entity[]=[];
  const known=runwayDatums.has(airport.id),height=(offset:number)=>known?runwayDatum(v,airport)+offset:new C.CallbackProperty(()=>runwayDatum(v,airport)+offset,false);
  const color=buildingMaterial(C,airport.lon,airport.lat,C.Color.fromCssColorString('#b9c6bd'));
  let index=airport.runways.length;
  for(const surface of airport.surfaces){
    if(surface.kind==='apron')continue;
    const id=all[index++]?.id;if(!id||surface.points.length<3)continue;
    added.push(v.entities.add({id,show:prefs.structures,polygon:{hierarchy:airportPolygonHierarchy(C,surface),height:0,heightReference:C.HeightReference.CLAMP_TO_GROUND,extrudedHeight:airportBuildingHeight(surface),extrudedHeightReference:C.HeightReference.RELATIVE_TO_GROUND,material:color,distanceDisplayCondition:new C.DistanceDisplayCondition(0,50000)}}));
  }
  for(const [i,r] of airport.runways.entries()){
    const corners=runwaySurfaceCorners(r);if(!corners.length)continue;
    added.push(v.entities.add({id:all[i].id,polygon:{hierarchy:C.Cartesian3.fromDegreesArray(corners.flat()),granularity:C.Math.toRadians(.001),height:height(.25),material:C.Color.fromCssColorString('#41464a'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,100000)},polyline:{show:prefs.labels,positions:known?C.Cartesian3.fromDegreesArrayHeights([...r.a,runwayDatum(v,airport)+.35,...r.b,runwayDatum(v,airport)+.35]):new C.CallbackProperty(()=>C.Cartesian3.fromDegreesArrayHeights([...r.a,runwayDatum(v,airport)+.35,...r.b,runwayDatum(v,airport)+.35]),false),arcType:C.ArcType.GEODESIC,granularity:C.Math.toRadians(.001),width:2,material:new C.PolylineDashMaterialProperty({color:C.Color.WHITE.withAlpha(.8),dashLength:12})},position:new C.CallbackPositionProperty(()=>C.Cartesian3.fromDegrees(...r.a,runwayDatum(v,airport)+1),false),label:{show:prefs.labels,text:r.id,font:prefs.largeLabels?'16px sans-serif':'12px sans-serif',showBackground:true,pixelOffset:new C.Cartesian2(0,-20),distanceDisplayCondition:new C.DistanceDisplayCondition(0,40000)}}));
  }
  for(const [i,g] of airport.gates.entries())added.push(v.entities.add({id:all[index+i]?.id,show:prefs.labels,position:C.Cartesian3.fromDegrees(...g.position),point:{heightReference:C.HeightReference.CLAMP_TO_GROUND,pixelSize:4,color:C.Color.fromCssColorString('#8fdfc8'),distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)},label:{text:g.label,heightReference:C.HeightReference.CLAMP_TO_GROUND,font:prefs.largeLabels?'15px sans-serif':'11px sans-serif',style:C.LabelStyle.FILL_AND_OUTLINE,outlineColor:C.Color.fromCssColorString('#071723'),outlineWidth:3,pixelOffset:new C.Cartesian2(0,-12),disableDepthTestDistance:Infinity,distanceDisplayCondition:new C.DistanceDisplayCondition(0,7000)}}));
  return added;
}
