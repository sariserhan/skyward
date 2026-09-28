import type * as Cesium from 'cesium';
export interface SharedCamera {lon:number;lat:number;height:number;heading:number;pitch:number;roll:number;}
export function parseCamera(raw:string|null):SharedCamera|null{
 if(!raw||raw.length>200)return null;const parts=raw.split(',');if(parts.length!==6||parts.some(p=>!p.trim()))return null;
 const [lon,lat,height,heading,pitch,roll]=parts.map(Number);
 if(![lon,lat,height,heading,pitch,roll].every(Number.isFinite)||Math.abs(lon)>180||Math.abs(lat)>90||height<1||height>100000000||Math.abs(heading)>Math.PI*2||Math.abs(pitch)>Math.PI/2||Math.abs(roll)>Math.PI*2)return null;
 return {lon,lat,height,heading,pitch,roll};
}
export function cameraSnapshot(v:Cesium.Viewer|null){if(!v||v.isDestroyed())return null;const p=v.camera.positionCartographic;return {lon:p.longitude*180/Math.PI,lat:p.latitude*180/Math.PI,height:p.height,heading:v.camera.heading,pitch:v.camera.pitch,roll:v.camera.roll};}
export function encodeCamera(p:SharedCamera){return [p.lon,p.lat,p.height,p.heading,p.pitch,p.roll].map(n=>n.toFixed(6)).join(',');}
export function downloadGlobeImage(v:Cesium.Viewer,label:string):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(v.isDestroyed()){reject(Error('Map unavailable.'));return;}
  let dispose:()=>void=()=>{};const timer=setTimeout(()=>{dispose();reject(Error('Map did not render. Close other dialogs and retry.'));},5000);
  dispose=v.scene.postRender.addEventListener(()=>{
   dispose();clearTimeout(timer);
   try{
    const source=v.canvas,width=Math.min(source.width,1600),height=Math.round(source.height*width/source.width);
    if(!width||!height)throw Error('Map is not visible.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+104;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image export unavailable.');
    ctx.drawImage(source,0,0,width,height);ctx.fillStyle='#091e29';ctx.fillRect(0,height,width,104);ctx.fillStyle='#e3f1f6';ctx.font='14px sans-serif';
    ctx.fillText(`Skyward · ${label} · ${new Date().toISOString()}`,12,height+22,width-24);
    const credits=v.cesiumWidget.creditContainer.textContent?.replace(/\s+/g,' ').trim()??'';
    ctx.font='11px sans-serif';
    const lines=['Observed fixes + predicted motion; not a recording.',`Map: ${credits}`, 'Sources: ADSB.lol (ODbL), OpenStreetMap contributors, OurAirports, NASA Black Marble 2016.'];
    lines.forEach((line,i)=>ctx.fillText(line,12,height+43+i*18,width-24));
    canvas.toBlob(blob=>{if(!blob){reject(Error('Image export unavailable.'));return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='skyward-view.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);resolve();},'image/png');
   }catch{reject(Error('Image export was blocked by the map imagery provider. Try Atlas and export again.'));}
  });v.scene.requestRender();
 });
}
