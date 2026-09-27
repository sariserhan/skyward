import {useEffect} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft,AirportGeometry} from '../types';
import {towerPose} from '../lib/tower';
export type SpotterCameraMode='follow'|'overhead'|'runway';
export function SpotterCamera({viewer,mode,selected,airport,paused}:{viewer:Cesium.Viewer|null;mode:SpotterCameraMode|null;selected:Aircraft|null;airport?:AirportGeometry;paused:boolean}){
 useEffect(()=>{if(!viewer||viewer.isDestroyed()||!mode||mode==='follow'||paused)return;const C=window.Cesium;viewer.camera.cancelFlight();viewer.trackedEntity=undefined;viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
 if(mode==='runway'){const r=airport?.runways[0];if(!r)return;const p=towerPose(r),ground=viewer.scene.globe.getHeight(C.Cartographic.fromDegrees(p.lon,p.lat))??0;viewer.camera.setView({destination:C.Cartesian3.fromDegrees(p.lon,p.lat,ground+p.height),orientation:{heading:p.heading*Math.PI/180,pitch:-.1,roll:0}});viewer.scene.requestRender();return;}
 const update=()=>{if(document.hidden||viewer.isDestroyed()||selected?.lat==null||selected.lon==null)return;const entity=viewer.entities.getById(`aircraft-${selected.hex}`),pos=entity?.position?.getValue(viewer.clock.currentTime),p=pos?C.Cartographic.fromCartesian(pos):C.Cartographic.fromDegrees(selected.lon,selected.lat,Math.max(0,selected.altitude??0)*.3048);viewer.camera.setView({destination:C.Cartesian3.fromRadians(p.longitude,p.latitude,p.height+10000),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});viewer.scene.requestRender();};update();const timer=setInterval(update,250);return()=>clearInterval(timer);
 },[viewer,mode,selected?.hex,airport,paused]);return null;
}
