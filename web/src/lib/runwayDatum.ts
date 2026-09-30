import type * as Cesium from 'cesium';
import type {AirportGeometry} from '../types';
import {runwayDatums} from './runwayTerrain';
/** Shared presentation elevation, not a surveyed runway profile. */
export function runwayDatum(v:Cesium.Viewer,airport:AirportGeometry){
 const C=window.Cesium;if(v.terrainProvider instanceof C.EllipsoidTerrainProvider)return 0;
 const known=runwayDatums.get(airport.id);if(known!==undefined)return known;
 const runway=airport.runways[0],sample=runway?v.scene.globe.getHeight(C.Cartographic.fromDegrees(...runway.a)):undefined;
 if(typeof sample==='number'&&Number.isFinite(sample)){runwayDatums.set(airport.id,sample);return sample;}return 0;
}
