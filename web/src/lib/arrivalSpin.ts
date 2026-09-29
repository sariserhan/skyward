import type * as Cesium from 'cesium';
/** One spin session. Interaction ends it; an explicit world-spin request installs a fresh session. */
export function installArrivalSpin(C:typeof Cesium,viewer:Cesium.Viewer,eligible:boolean,state:()=>{stop:boolean;paused:boolean}) {
 if(!eligible)return ()=>{};
 let active=true,frame=0,last=performance.now(),start=last;
 const stop=()=>{active=false;cancelAnimationFrame(frame);};
 const tick=(time:number)=>{
  if(!active||viewer.isDestroyed())return;
  const s=state();if(s.stop){stop();return;}
  const elapsed=Math.min(.1,Math.max(0,(time-last)/1000));last=time;
  if(time-start>1600&&!document.hidden&&!s.paused&&!document.querySelector('dialog[open]')){
   viewer.camera.rotate(C.Cartesian3.UNIT_Z,-elapsed*.018);
   viewer.scene.requestRender();
  }
  frame=requestAnimationFrame(tick);
 };
 const options={passive:true};
 for(const event of ['pointerdown','wheel','keydown','touchstart'])viewer.canvas.addEventListener(event,stop,options);
 // Controls outside the canvas must also take ownership of the camera.
 const external=(event:Event)=>{if((event.target as HTMLElement)?.closest?.('button,summary,input,select,a'))stop();};
 document.addEventListener('pointerdown',external,true);document.addEventListener('skyward-stop-intro',stop);
 frame=requestAnimationFrame(tick);
 return()=>{stop();for(const event of ['pointerdown','wheel','keydown','touchstart'])viewer.canvas.removeEventListener(event,stop);document.removeEventListener('pointerdown',external,true);document.removeEventListener('skyward-stop-intro',stop);};
}
