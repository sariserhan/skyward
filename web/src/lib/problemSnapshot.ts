import type * as Cesium from 'cesium';
import {readRenderStats} from './renderDiagnostics.ts';
export interface FeedTiming {capturedAt:number;lastSuccessAt:number|null;interrupted:boolean;}
const history=new WeakMap<object,FeedTiming[]>();
export function recordFeedTiming(key:object,error:boolean,updatedAt:number|null,now=Date.now()){
 const rows=history.get(key)??[],last=rows.at(-1);if(last?.interrupted===error&&last?.lastSuccessAt===updatedAt)return;
 rows.push({capturedAt:now,lastSuccessAt:Number.isFinite(updatedAt)?updatedAt:null,interrupted:error});history.set(key,rows.slice(-30));
}
/** Explicit fields only: no tokens, cookies, URLs, storage contents or passenger data. */
export function problemSnapshot(viewer:Cesium.Viewer,quality:string,automatic:string|null){
 const c=viewer.camera,position=c.positionCartographic;
 return {format:'skyward-problem-snapshot',version:1,createdAt:new Date().toISOString(),camera:{lat:position.latitude*180/Math.PI,lon:position.longitude*180/Math.PI,height:position.height,heading:c.heading*180/Math.PI,pitch:c.pitch*180/Math.PI,roll:c.roll*180/Math.PI},display:{width:viewer.canvas.clientWidth,height:viewer.canvas.clientHeight,pixelRatio:devicePixelRatio,resolutionScale:viewer.resolutionScale,quality,automaticQuality:automatic,sceneMode:viewer.scene.mode},performance:readRenderStats(viewer),scene:{entities:viewer.entities.values.length,dataSources:viewer.dataSources.length,primitives:viewer.scene.primitives.length},feedTimings:history.get(viewer)??[]};
}
export function downloadProblemSnapshot(snapshot:ReturnType<typeof problemSnapshot>){const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`skyward-problem-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
