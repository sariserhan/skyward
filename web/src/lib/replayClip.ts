import type * as Cesium from 'cesium';
/** Local canvas recording only. Private account UI and audio are never captured. */
export function recordReplayClip(viewer:Cesium.Viewer,seconds:number,signal:AbortSignal,source='Source unavailable'):Promise<Blob>{
 if(![10,20,30].includes(seconds)||viewer.isDestroyed())return Promise.reject(Error('Choose a 10–30 second clip.'));
 if(typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream)return Promise.reject(Error('Video export is unavailable in this browser. Export the session file instead.'));
 return new Promise((resolve,reject)=>{
  const canvas=document.createElement('canvas'),width=Math.min(1280,viewer.canvas.width);canvas.width=width;canvas.height=Math.round(viewer.canvas.height*width/viewer.canvas.width)+72;const ctx=canvas.getContext('2d');if(!ctx||!width){reject(Error('Map is not ready.'));return;}
  let stream:MediaStream|undefined,recorder:MediaRecorder|undefined,timer:ReturnType<typeof setTimeout>|undefined,drawTimer:ReturnType<typeof setInterval>|undefined,finished=false;const parts:Blob[]=[];
  const clean=()=>{clearTimeout(timer);clearInterval(drawTimer);signal.removeEventListener('abort',abort);stream?.getTracks().forEach(t=>t.stop());};
  const fail=(message:string)=>{if(finished)return;finished=true;if(recorder?.state==='recording')recorder.stop();clean();reject(Error(message));};
  const abort=()=>fail('Clip cancelled.');
  function draw(){if(viewer.isDestroyed()||document.hidden){fail('Keep the replay visible while exporting.');return;}try{viewer.scene.render();ctx!.drawImage(viewer.canvas,0,0,width,canvas.height-72);ctx!.fillStyle='#091e29';ctx!.fillRect(0,canvas.height-72,width,72);ctx!.fillStyle='#e3f1f6';ctx!.font='12px sans-serif';ctx!.fillText('Skyward replay · recorded positions with interpolated motion · not live',12,canvas.height-49,width-24);ctx!.font='10px sans-serif';ctx!.fillText('Map: '+(viewer.cesiumWidget.creditContainer.textContent||'').replace(/\s+/g,' ').slice(0,600),12,canvas.height-29,width-24);ctx!.fillText(('Aircraft data: '+source+' · No audio recorded.').slice(0,300),12,canvas.height-11,width-24);}catch{fail('Imagery blocked video export. Switch to Atlas and retry.');}}
  try{draw();if(finished)return;stream=canvas.captureStream(20);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:2500000});recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder.onerror=()=>fail('Video encoding failed.');recorder.onstop=()=>{if(finished)return;finished=true;clean();resolve(new Blob(parts,{type:recorder!.mimeType}));};recorder.start(1000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}drawTimer=setInterval(draw,50);timer=setTimeout(()=>recorder?.stop(),seconds*1000);}catch{fail('This browser cannot record the map canvas.');}
 });
}
