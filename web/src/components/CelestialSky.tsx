import {skyObscuration} from '../lib/weatherSky';
import {skyCameraPose} from '../lib/skyCamera';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type * as Cesium from 'cesium';
import {moonState,planetIcon,SKY_BODIES,type SkyName} from '../lib/celestial';
// Ephemeris calculation is loaded with this component, separately from the app shell.
import {skyPositions} from '../lib/celestial';
export default function CelestialSky({viewer,enabled,host,onInteract,navigationKey}:{viewer:Cesium.Viewer|null;enabled:boolean;host:HTMLElement|null;onInteract:()=>void;reduced:boolean;navigationKey:string}) {
 const [labels,setLabels]=useState(()=>{try{return localStorage.getItem('skyward.sky.labels')==='true';}catch{return false;}});
 const labelsRef=useRef(labels);labelsRef.current=labels;
 const [focusError,setFocusError]=useState('');
 const [moon,setMoon]=useState(()=>moonState(new Date()));
 const [hover,setHover]=useState<{name:string;x:number;y:number}|null>(null),[selected,setSelected]=useState<SkyName|null>(null);
 const bodies=useRef(new Map<string,Cesium.Entity>()),returnPose=useRef<{position:Cesium.Cartesian3;direction:Cesium.Cartesian3;up:Cesium.Cartesian3}|null>(null);
 useEffect(()=>{setSelected(null);setHover(null);returnPose.current=null;},[viewer,enabled,navigationKey]);
 useEffect(()=>{
  if(!viewer||viewer.isDestroyed()||!enabled)return;
  const v=viewer,C=window.Cesium,originalSun=v.scene.sun?.show,originalMoon=v.scene.moon?.show;
  // Pickable illustrative discs replace the unpickable native discs in globe mode.
  if(v.scene.sun)v.scene.sun.show=false;if(v.scene.moon)v.scene.moon.show=false;
  const update=()=>{
   if(document.hidden||v.isDestroyed())return;
   const phase=moonState(new Date());setMoon(phase);
   for(const body of skyPositions(new Date())){
    const position=C.Cartesian3.multiplyByScalar(new C.Cartesian3(body.direction.x,body.direction.y,body.direction.z),250000000,new C.Cartesian3());
    let entity=bodies.current.get(body.name);
    if(!entity){entity=v.entities.add({id:`celestial-${body.name}`,name:body.name,position,billboard:{image:planetIcon(body.name,body.color,phase),width:body.size,height:body.size,disableDepthTestDistance:0},label:{text:body.name,show:labelsRef.current,font:"13px sans-serif",pixelOffset:new C.Cartesian2(0,body.size/2+12),fillColor:C.Color.WHITE,style:C.LabelStyle.FILL_AND_OUTLINE,outlineColor:C.Color.BLACK,outlineWidth:3}});bodies.current.set(body.name,entity);}
    else {entity.position=new C.ConstantPositionProperty(position);if(body.name==='Moon'&&entity.billboard)entity.billboard.image=new C.ConstantProperty(planetIcon(body.name,body.color,phase));}
   }
   v.scene.requestRender();
  };
  let lastCover=-1;
  const weather=v.scene.preRender.addEventListener(()=>{const cover=skyObscuration(v);if(Math.abs(cover-lastCover)<.01)return;lastCover=cover;for(const entity of bodies.current.values()){entity.show=cover<.92;if(entity.billboard)entity.billboard.color=new C.ConstantProperty(C.Color.WHITE.withAlpha(1-cover));}});
  update();const timer=setInterval(update,60000);
  const handler=new C.ScreenSpaceEventHandler(v.canvas);
  handler.setInputAction((event:{endPosition:Cesium.Cartesian2})=>{
   if(v.isDestroyed()||!v.canvas.width||!v.canvas.height)return;
   let pick;try{pick=v.scene.pick(event.endPosition);}catch{return;}const id=pick?.id?.id;
   if(typeof id==='string'&&id.startsWith('celestial-'))setHover({name:id.slice(10),x:Math.min(event.endPosition.x+14,v.canvas.clientWidth-170),y:Math.max(8,event.endPosition.y-45)});
   else setHover(null);
  },C.ScreenSpaceEventType.MOUSE_MOVE);
  const leave=()=>setHover(null);v.canvas.addEventListener('pointerleave',leave);
  return()=>{weather();clearInterval(timer);handler.destroy();v.canvas.removeEventListener('pointerleave',leave);if(!v.isDestroyed()){for(const entity of bodies.current.values())v.entities.remove(entity);if(v.scene.sun)v.scene.sun.show=originalSun??true;if(v.scene.moon)v.scene.moon.show=originalMoon??true;v.scene.requestRender();}bodies.current.clear();};
 },[viewer,enabled]);
 useEffect(()=>{try{localStorage.setItem('skyward.sky.labels',String(labels));}catch{}for(const e of bodies.current.values())if(e.label)e.label.show=new window.Cesium.ConstantProperty(labels);if(viewer&&!viewer.isDestroyed())viewer.scene.requestRender();},[labels,viewer]);
 useEffect(()=>{if(!selected)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented&&!document.querySelector('dialog[open],.unified-map-tools[open],.cesium-credit-lightbox-overlay[style*="block"]')){e.preventDefault();back();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[selected,viewer]);
 const back=()=>{if(!viewer||viewer.isDestroyed()||!returnPose.current)return;const p=returnPose.current;viewer.camera.cancelFlight();viewer.camera.setView({destination:p.position,orientation:{direction:p.direction,up:p.up}});viewer.scene.requestRender();returnPose.current=null;setSelected(null);setHover(null);};
 const focus=(name:SkyName)=>{
  if(!viewer||viewer.isDestroyed())return;const v=viewer,C=window.Cesium,entity=bodies.current.get(name),target=entity?.position?.getValue(v.clock.currentTime);if(!target)return;
  const pose=skyCameraPose(target);if(!pose){setFocusError('Sky position unavailable. Please try again.');return;}
  const saved={position:C.Cartesian3.clone(v.camera.positionWC),direction:C.Cartesian3.clone(v.camera.directionWC),up:C.Cartesian3.clone(v.camera.upWC)};
  try{
   document.dispatchEvent(new Event('skyward-stop-intro'));onInteract();v.camera.cancelFlight();v.trackedEntity=undefined;v.camera.lookAtTransform(C.Matrix4.IDENTITY);
   // flyTo plans a route over the ellipsoid. Celestial views look away from it;
   // applying the orthonormal pose directly avoids that incompatible flight path.
   v.camera.setView({destination:new C.Cartesian3(pose.position.x,pose.position.y,pose.position.z),orientation:{direction:new C.Cartesian3(pose.direction.x,pose.direction.y,pose.direction.z),up:new C.Cartesian3(pose.up.x,pose.up.y,pose.up.z)}});
   returnPose.current??=saved;setSelected(name);setHover(null);setFocusError('');v.scene.requestRender();
  }catch{
   if(!v.isDestroyed()){try{v.camera.setView({destination:saved.position,orientation:{direction:saved.direction,up:saved.up}});}catch{/* The globe's graphics recovery owns a lost renderer. */}}
   setFocusError('Sky camera unavailable. Your previous view has been kept; try again.');
  }
 };
 if(!enabled)return null;
 return <>{host&&createPortal(<details className="sky-finder"><summary>Sun, Moon &amp; planets</summary><p>Calculated sky directions. Illustrative markers; sizes and distances are compressed.</p><label className="sky-label-toggle"><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/> Show sky labels</label><p>{moon.name} · {Math.round(moon.fraction*100)}% illuminated. Earth-view phase; orientation is illustrative.</p><div>{SKY_BODIES.map(body=><button key={body.name} onClick={()=>focus(body.name)} aria-pressed={selected===body.name} title={body.name}><img src={planetIcon(body.name,body.color,moon)} alt=""/>{body.name}</button>)}</div>{focusError&&<p role="alert">{focusError}</p>}{selected&&<button onClick={back}>Back to Earth</button>}</details>,host)}
 {hover&&<div className="celestial-tooltip" role="tooltip" style={{left:Math.max(8,hover.x),top:hover.y}}><strong>{hover.name}</strong><small>Calculated sky position · enlarged marker</small></div>}
 {selected&&<div className="sky-focus-note"><strong>{selected}</strong><span>{selected==='Moon'?`${moon.name} · ${Math.round(moon.fraction*100)}% lit`:'Illustrative sky marker'}</span><button onClick={back} title="Escape returns to Earth">Back to Earth <small>Esc</small></button></div>}
 </>;
}
