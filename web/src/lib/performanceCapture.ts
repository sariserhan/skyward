import type * as Cesium from 'cesium';
import {renderLayerCounts} from './renderLayers.ts';
import {readRenderStats} from './renderDiagnostics.ts';
import {qualityEvents} from './qualityEvents.ts';
export function timingSummary(values:number[]){const rows=values.filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);return {samples:rows.length,p50:rows[Math.floor(rows.length*.5)]??0,p95:rows[Math.min(rows.length-1,Math.floor(rows.length*.95))]??0,over50:rows.filter(n=>n>50).length};}
/** Thirty visible seconds, explicitly started by the user. Submission timing is NOT GPU time. */
export function capturePerformance(viewer:Cesium.Viewer,progress:(seconds:number)=>void,done:(report:object)=>void){
 const intervals:number[]=[],submission:number[]=[],tasks:number[]=[],workload:object[]=[];let previous=0,elapsed=0,handle=0,start=0,stopped=false,lastWorkload=-1;
 let observer:PerformanceObserver|null=null;
 try{if(PerformanceObserver.supportedEntryTypes.includes('longtask')){observer=new PerformanceObserver(list=>{if(!document.hidden)for(const e of list.getEntries())tasks.push(e.duration);});observer.observe({entryTypes:['longtask']});}}catch{/* Unsupported in some browsers. */}
 const pre=viewer.scene.preRender.addEventListener(()=>{start=performance.now();});
 const post=viewer.scene.postRender.addEventListener(()=>{if(!document.hidden&&submission.length<12000)submission.push(performance.now()-start);});
 const visibility=()=>{previous=0;};document.addEventListener('visibilitychange',visibility);
 const cancel=()=>{if(stopped)return;stopped=true;cancelAnimationFrame(handle);pre();post();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);};
 const tick=(now:number)=>{
  if(stopped)return;if(viewer.isDestroyed()){cancel();return;}
  if(document.hidden)previous=0;else{if(previous){const delta=now-previous;elapsed+=delta;if(intervals.length<12000)intervals.push(delta);}previous=now;
   const second=Math.floor(elapsed/1000);if(second!==lastWorkload){lastWorkload=second;progress(Math.min(30,second));workload.push({second,entities:viewer.entities.values.length,dataSources:viewer.dataSources.length,primitives:viewer.scene.primitives.length,layers:renderLayerCounts(viewer.scene.primitives),aircraftModels:viewer.entities.values.filter(e=>e.show&&e.model).length,terrainReady:viewer.scene.globe.tilesLoaded,...readRenderStats(viewer)});}
  }
  if(elapsed>=30000){const longTasksSupported=!!observer;cancel();done({format:'skyward-performance-capture',version:1,createdAt:new Date().toISOString(),visibleSeconds:elapsed/1000,display:{width:viewer.canvas.clientWidth,height:viewer.canvas.clientHeight,pixelRatio:devicePixelRatio},browserFrames:timingSummary(intervals),renderSubmission:timingSummary(submission),longTasks:longTasksSupported?timingSummary(tasks):null,workload,qualityEvents:qualityEvents(),interpretation:'Long tasks indicate main-thread contention. Slow frames without long tasks may involve graphics, browser scheduling or uninstrumented work. Submission timings are CPU wall time, not GPU measurements. Layer counts do not prove a bottleneck.'});return;}handle=requestAnimationFrame(tick);
 };handle=requestAnimationFrame(tick);return cancel;
}
export function downloadCapture(report:object){const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`skyward-performance-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
