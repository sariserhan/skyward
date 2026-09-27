import {CabinPassengers} from './CabinPassengers';
import {aircraftViewpoint} from '../lib/flightViewpoints';
import {CabinAudioSwitch} from './CabinAudioSwitch';
import {PredictionDetails} from './PredictionDetails';
import {readFlightPreferences,saveFlightPreferences} from '../lib/flightPreferences';
import {reattachBlend,cameraFloor} from '../lib/cameraSafety';
import {SheetHandle} from './SheetHandle';
import {RouteLayer} from './RouteLayer';
import {RouteOverview} from './RouteOverview';
import {PassengerGeography} from './PassengerGeography';
import {MotionDiagnostics} from './MotionDiagnostics';
import {LiveMotion,liveFrame,liveMotionStatus} from '../lib/liveMotion';
import {AircraftIdentity} from './AircraftIdentity';
import {useEffect,useMemo,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft,AirportGeometry,TrailPoint,GeometryFile,FlightRoute} from '../types';
import {aircraftNames,airline} from '../lib/aircraft';
import {nearestCity,type City} from '../lib/cities';
import {profileNames,fullLivery,fleetUri,fallbackFleetUri,sourcedModel,fleetProfile,fleetPaint,runwayFrame} from '../lib/flightPresentation';
import {angleStep,flightFraming,illustrativeGear,wheelAngle} from '../lib/flightVisuals';
import {ageSeconds} from '../lib/aircraft';
const profileLengths:Record<string,number>={b772:64,b788:57,b78x:68,a35k:74,e190:36,crj:36,pc12:14,a380:73,b747:71,b777:74,b787:63,a330:64,a350:67,b767:55,b757:47,bizjet:22,light:9,turboprop:23};
type View='route'|'chase'|'side'|'orbit'|'area'|'pilot'|'cabin'|'bird'|'free';
interface Props {arrivalGeometry:AirportGeometry|null;modelStage:'primary'|'fallback'|'marker';retryModel:()=>void;modelReady:boolean;suspended:boolean;quality:string;feedHealth:{error:string;updatedAt:number|null};cities:City[];onOpenChange:(open:boolean)=>void;navigationKey:string;viewer:Cesium.Viewer|null;aircraft:Aircraft|null;trail:TrailPoint[];geometry:GeometryFile|null;route:FlightRoute|null;reducedMotion:boolean;mode:'2D'|'3D';replay:boolean;onRoute:()=>void;}
export function FlightExperience(p:Props){
 const [open,setOpen]=useState(false),[view,setView]=useState<View>(()=>readFlightPreferences().view as View),[demo,setDemo]=useState<'takeoff'|'landing'|null>(null),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[runway,setRunway]=useState(0);
 const [cabinSide,setCabinSide]=useState<'left'|'right'>('right');
 const [distance,setDistance]=useState(()=>readFlightPreferences().distance),[compact,setCompact]=useState(()=>readFlightPreferences().compact);
 const panelRef=useRef<HTMLElement>(null);
 useEffect(()=>{saveFlightPreferences({distance,compact,...(['chase','side','orbit','area','pilot','cabin','bird'].includes(view)?{view}:{})});},[view,distance,compact]);
 const state=useRef({p,open,view,demo,progress,playing,runway,distance,cabinSide});state.current={p,open,view,demo,progress,playing,runway,distance,cabinSide};
 const nearest=useMemo(()=>p.aircraft?.lon!=null&&p.aircraft?.lat!=null?nearestCity(p.cities,p.aircraft.lon,p.aircraft.lat):null,[p.cities,p.aircraft?.lon,p.aircraft?.lat]);
 useEffect(()=>{p.onOpenChange(open);return()=>p.onOpenChange(false);},[open,p.onOpenChange]);
 const last=useRef(0),frame=useRef(0),elapsed=useRef(0);
 const eligible=p.aircraft?.targetKind==='aircraft'&&p.aircraft.lat!==null&&p.aircraft.lon!==null&&p.aircraft.altitude!==null;const airport=p.geometry?.airports[0];const runways=airport?.runways??[];
 useEffect(()=>{setOpen(false);setDemo(null);setPlaying(false);setProgress(0);},[p.aircraft?.hex,p.geometry?.airports[0]?.id,p.mode,p.replay,p.navigationKey]);
 useEffect(()=>{if(p.reducedMotion)setPlaying(false);},[p.reducedMotion]);
 useEffect(()=>{
  const candidate=p.viewer;if(!candidate||!open||p.mode!=='3D'||p.replay)return;const v=candidate,original=p.aircraft,C=window.Cesium;
  v.camera.cancelFlight();v.trackedEntity=undefined;last.current=0;const originalNear=v.camera.frustum.near;
  const release=()=>{previousView='free';setView('free');};v.canvas.addEventListener('pointerdown',release);v.canvas.addEventListener('wheel',release);v.canvas.addEventListener('keydown',release);
  const hidden=()=>{if(document.hidden||state.current.p.suspended)setPlaying(false);last.current=0;};document.addEventListener('visibilitychange',hidden);
  let shown:Cesium.Entity|undefined,drawn='',cameraAngle=original?.heading??0,cameraRange=0,layoutDirty=true,box:{left:number;top:number;right:number;bottom:number}|null=null;
  const layout=()=>{const canvas=v.canvas.getBoundingClientRect(),panel=panelRef.current?.getBoundingClientRect();box=panel?{left:panel.left-canvas.left,top:panel.top-canvas.top,right:panel.right-canvas.left,bottom:panel.bottom-canvas.top}:null;layoutDirty=true;};
  const resize=new ResizeObserver(layout);resize.observe(v.canvas);if(panelRef.current)resize.observe(panelRef.current);layout();
  function gear(entity:Cesium.Entity,a:Aircraft,amount:number,speed:number,moving:boolean){
   if(!entity.model||(sourcedModel(a.aircraftType)&&state.current.p.modelStage==='primary'))return;
   const wheel=moving?wheelAngle(elapsed.current,speed,.4):0,rotation=C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_X,wheel);
   entity.model.nodeTransformations=new C.PropertyBag({Gear:new C.TranslationRotationScale(new C.Cartesian3(0,(1-amount)*3.5,0),C.Quaternion.IDENTITY,new C.Cartesian3(amount<=.001?0:1,amount<=.001?0:1,amount<=.001?0:1)),...Object.fromEntries(['WheelN','WheelL','WheelR'].map(name=>[name,new C.TranslationRotationScale(C.Cartesian3.ZERO,rotation)]))});
  }
  let previousView:View='free',reattachTime=0;
  let fromPosition=C.Cartesian3.clone(v.camera.positionWC),fromDirection=C.Cartesian3.clone(v.camera.directionWC),fromUp=C.Cartesian3.clone(v.camera.upWC);
  function camera(pos:Cesium.Cartesian3,heading:number,view:View,dt:number){
   const s=state.current;
   if(previousView!==view){reattachTime=0;fromPosition=C.Cartesian3.clone(v.camera.positionWC);fromDirection=C.Cartesian3.clone(v.camera.directionWC);fromUp=C.Cartesian3.clone(v.camera.upWC);}previousView=view;reattachTime+=dt;
   const length=sourcedModel(s.p.aircraft?.aircraftType??'')?.length??profileLengths[fleetProfile(s.p.aircraft?.aircraftType??'')]??40;
   const framing=flightFraming(v.canvas.clientWidth,v.canvas.clientHeight,box,length,s.distance,(v.camera.frustum as Cesium.PerspectiveFrustum).fov??Math.PI/3);
   const targetAngle=view==='area'?0:heading+(view==='side'?90:view==='orbit'?elapsed.current*(s.p.reducedMotion?0:8):0),targetRange=view==='area'?180000:framing.range*(view==='bird'?1.3:1);
   const blend=s.p.reducedMotion?1:1-Math.exp(-dt*7);cameraAngle=angleStep(cameraAngle,targetAngle,blend);cameraRange=cameraRange?cameraRange+(targetRange-cameraRange)*blend:targetRange;
   const onboard=view==='pilot'||view==='cabin';v.camera.frustum.near=onboard?.2:originalNear;
   if(onboard){
    const point=aircraftViewpoint(view,length,heading,s.cabinSide),enu=C.Transforms.eastNorthUpToFixedFrame(pos);
    const destination=C.Matrix4.multiplyByPoint(enu,new C.Cartesian3(point.east,point.north,point.up),new C.Cartesian3());
    v.camera.lookAtTransform(C.Matrix4.IDENTITY);v.camera.setView({destination,orientation:{heading:point.heading,pitch:point.pitch,roll:0}});
   }else{
    v.camera.lookAt(pos,new C.HeadingPitchRange(cameraAngle*Math.PI/180,view==='area'?-Math.PI/2:view==='bird'?-1.35:-.18,cameraRange));v.camera.lookAtTransform(C.Matrix4.IDENTITY);
    if(view!=='area'){
     const halfHeight=cameraRange*Math.tan(framing.vfov/2),halfWidth=halfHeight*v.canvas.clientWidth/v.canvas.clientHeight;
     v.camera.moveRight(-2*halfWidth*(framing.cx/v.canvas.clientWidth-.5));v.camera.moveUp(2*halfHeight*(framing.cy/v.canvas.clientHeight-.5));
    }
   }
   const blendBack=reattachBlend(reattachTime,s.p.reducedMotion);
   if(blendBack<1){
    const dest=C.Cartesian3.lerp(fromPosition,v.camera.positionWC,blendBack,new C.Cartesian3());
    const direction=C.Cartesian3.lerp(fromDirection,v.camera.directionWC,blendBack,new C.Cartesian3()),up=C.Cartesian3.lerp(fromUp,v.camera.upWC,blendBack,new C.Cartesian3());
    // Avoid degenerate direction/up vectors while recovering from a reversed camera.
    if(C.Cartesian3.magnitudeSquared(direction)>.0001&&C.Cartesian3.magnitudeSquared(C.Cartesian3.cross(direction,up,new C.Cartesian3()))>.0001)v.camera.setView({destination:dest,orientation:{direction:C.Cartesian3.normalize(direction,direction),up:C.Cartesian3.normalize(up,up)}});
   }
   const cart=v.camera.positionCartographic,floor=cameraFloor(v.scene.globe.getHeight(cart));
   if(cart.height<floor){const dest=C.Cartesian3.fromRadians(cart.longitude,cart.latitude,floor),direction=C.Cartesian3.normalize(C.Cartesian3.subtract(pos,dest,new C.Cartesian3()),new C.Cartesian3()),up=C.Ellipsoid.WGS84.geodeticSurfaceNormal(dest,new C.Cartesian3());if(onboard)v.camera.setView({destination:dest,orientation:{direction:C.Cartesian3.clone(v.camera.directionWC),up:C.Cartesian3.clone(v.camera.upWC)}});else if(C.Cartesian3.magnitudeSquared(C.Cartesian3.cross(direction,up,new C.Cartesian3()))>.0001)v.camera.setView({destination:dest,orientation:{direction,up}});else v.camera.setView({destination:dest});}
   return blendBack<1||Math.abs(targetRange-cameraRange)>.05||Math.abs(((targetAngle-cameraAngle+540)%360)-180)>.02;
  }
  let cameraMoving=true;const motion=new LiveMotion();
  const tick=(now:number)=>{
   if(v.isDestroyed())return;frame.current=requestAnimationFrame(tick);if(document.hidden||state.current.p.suspended)return;if(last.current&&now-last.current<33)return;
   const s=state.current,dt=last.current?Math.min(.1,(now-last.current)/1000):.033;last.current=now;elapsed.current+=dt;
   let fraction=s.progress;if(s.demo&&s.playing){fraction=Math.min(1,fraction+dt/45);state.current.progress=fraction;setProgress(fraction);if(fraction===1)setPlaying(false);}
   const a=s.p.aircraft;if(!a)return;const r=s.p.geometry?.airports[0]?.runways[s.runway],actual=v.entities.getById(`aircraft-${a.hex}`);if(actual)actual.show=!s.demo;
   const fix=s.demo&&r?runwayFrame(r,s.demo,fraction):motion.sample(a,s.p.trail,Date.now(),s.p.reducedMotion,s.p.route,s.p.arrivalGeometry);
   let heading=a.heading??0,pitch=0;if(fix&&'heading' in fix&&typeof fix.heading==='number')heading=fix.heading;if(fix&&'pitch' in fix)pitch=fix.pitch??0;
   const movingWheels=!s.p.reducedMotion&&!sourcedModel(a.aircraftType)&&(s.demo?!!fix?.ground:(!!fix?.ground&&(!!fix&&'landingPhase' in fix&&!!fix.landingPhase||ageSeconds(a,Date.now())<=30)))&&(s.demo?s.playing:((fix&&'groundSpeed' in fix?fix.groundSpeed:a.groundSpeed)??0)>0);
   const key=JSON.stringify([fix?.lon,fix?.lat,fix?.altitude,heading,pitch,a.callsign,a.aircraftType,a.ground,s.demo,s.view,s.cabinSide,s.distance,s.p.reducedMotion,fraction]);
   if(key===drawn&&!cameraMoving&&!layoutDirty&&!movingWheels&&!(s.view==='orbit'&&!s.p.reducedMotion))return;drawn=key;layoutDirty=false;
   let position=actual?.position?.getValue(v.clock.currentTime);
   if(fix){
    const landing='landingPhase' in fix&&!!fix.landingPhase;
    const ground=s.demo&&r?(v.scene.globe.getHeight(C.Cartographic.fromDegrees(r.a[0],r.a[1]))??0):landing?(v.scene.globe.getHeight(C.Cartographic.fromDegrees(fix.lon,fix.lat))??0)-(s.p.arrivalGeometry?.elevationFt??0)*.3048:0;
    position=C.Cartesian3.fromDegrees(fix.lon,fix.lat,ground+Math.max(0,fix.altitude)*.3048+5);
    if(s.demo){
     if(!shown)shown=v.entities.add({id:'flight-simulation',model:{uri:import.meta.env.BASE_URL+(s.p.modelStage==='primary'?fleetUri(a):fallbackFleetUri(a)),minimumPixelSize:0,maximumScale:1,heightReference:C.HeightReference.NONE,shadows:C.ShadowMode.ENABLED},label:{text:'SIMULATION',font:'bold 14px sans-serif',fillColor:C.Color.ORANGE,pixelOffset:new C.Cartesian2(0,-65)}});
     if(shown.model?.uri?.getValue(v.clock.currentTime)!==import.meta.env.BASE_URL+(s.p.modelStage==='primary'?fleetUri(a):fallbackFleetUri(a)))shown.model!.uri=new C.ConstantProperty(import.meta.env.BASE_URL+(s.p.modelStage==='primary'?fleetUri(a):fallbackFleetUri(a)));
     gear(shown,a,illustrativeGear(s.demo,fraction),s.demo==='takeoff'?fraction*220:(1-fraction)*140,movingWheels);
     shown.position=new C.ConstantPositionProperty(position);shown.orientation=new C.ConstantProperty(C.Transforms.headingPitchRollQuaternion(position,new C.HeadingPitchRoll((heading-90)*Math.PI/180,pitch*Math.PI/180,0)));
    }else{
     if(shown){v.entities.remove(shown);shown=undefined;}
     if(actual){actual.position=new C.ConstantPositionProperty(position);actual.orientation=new C.ConstantProperty(C.Transforms.headingPitchRollQuaternion(position,new C.HeadingPitchRoll((heading-90)*Math.PI/180,pitch*Math.PI/180,0)));}
    }
   }
   if(!s.demo&&actual)gear(actual,a,fix&&'landingPhase' in fix&&fix.landingPhase?1:a.ground?1:0,fix&&'groundSpeed' in fix?fix.groundSpeed??0:a.groundSpeed??0,movingWheels);
   if(s.view!=='pilot'&&s.view!=='cabin')v.camera.frustum.near=originalNear;
   if(s.view==='free')previousView='free';
   cameraMoving=!!position&&s.view!=='free'&&s.view!=='route'?camera(position!,heading,s.view,dt):false;v.scene.requestRender();
  };
  frame.current=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame.current);resize.disconnect();v.canvas.removeEventListener('pointerdown',release);v.canvas.removeEventListener('wheel',release);v.canvas.removeEventListener('keydown',release);document.removeEventListener('visibilitychange',hidden);if(!v.isDestroyed()){v.camera.frustum.near=originalNear;if(shown)v.entities.remove(shown);const a=state.current.p.aircraft?.hex===original?.hex?state.current.p.aircraft:original,e=a&&v.entities.getById(`aircraft-${a.hex}`);if(e&&a){e.show=true;if(a.lon!==null&&a.lat!==null)e.position=new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(a.lon,a.lat,Math.max(0,a.altitude??0)*.3048+8));gear(e,a,a.ground?1:0,0,false);}v.camera.lookAtTransform(C.Matrix4.IDENTITY);v.scene.requestRender();}};
 },[p.viewer,open,p.mode,p.replay]);

 if(!eligible||p.mode!=='3D'||p.replay)return null;
 if(!open)return <button className="flight-view-trigger" onClick={()=>{setView('side');setOpen(true);}}>✈ Flight view</button>;
 const a=p.aircraft!;const presentation=liveFrame(a,p.trail,Date.now(),p.reducedMotion,p.route,p.arrivalGeometry);const landing=!!presentation?.landingPhase;const location=landing?nearestCity(p.cities,presentation.lon,presentation.lat):nearest;const asset=p.modelStage==='primary'?sourcedModel(a.aircraftType):null;const route=p.route;const endpoints=route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status)&&route.airports.length===2?route.airports:null;
 return <><RouteLayer viewer={p.viewer} aircraft={a} route={route} trail={p.trail} active={view==='route'&&!demo}/><section ref={panelRef} className={`flight-experience${compact?' flight-compact':''}`} aria-label="Passenger flight view"><SheetHandle rememberFlight/><header>{fleetPaint(a.callsign)!=='neutral'&&<img className="flight-airline-logo" src={`${import.meta.env.BASE_URL}airlines/${fleetPaint(a.callsign)}.png`} alt={`${airline(a)} logo`} onError={e=>{e.currentTarget.style.display='none';}}/>}<strong>{demo?'SIMULATION · '+demo.toUpperCase():a.callsign||a.registration||a.hex}</strong><button aria-label={compact?'Expand flight details':'Collapse flight details'} onClick={()=>setCompact(!compact)}>{compact?'+':'−'}</button><button aria-label="Close flight view" onClick={()=>{setOpen(false);setDemo(null);setPlaying(false);}}>×</button></header>
 {view==='free'&&<button className="resume-flight-camera" onClick={()=>setView('chase')}>Resume flight camera</button>}<div className="flight-buttons">{(['chase','pilot','cabin','bird','side','orbit','area','free'] as View[]).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='pilot'?'Pilot':v==='cabin'?'Cabin':v==='bird'?'Bird’s-eye':v}</button>)}<button disabled={!endpoints||!!demo} onClick={()=>{setView('route');p.onRoute();}}>Route</button></div>
 {view==='pilot'&&<p className="flight-viewpoint-note">Forward view along the flight heading · approximate cockpit position, no modeled interior.</p>}
 {view==='cabin'&&<><div className="flight-buttons" aria-label="Cabin window side">{(['left','right'] as const).map(side=><button key={side} aria-pressed={cabinSide===side} onClick={()=>setCabinSide(side)}>{side==='left'?'Left window':'Right window'}</button>)}</div><p className="flight-viewpoint-note">Window-side view beside the aircraft · approximate seat position, no modeled cabin interior.</p></>}
 {view==='bird'&&<p className="flight-viewpoint-note">Following above the aircraft, aligned with its heading.</p>}
 {!demo&&<p className="flight-motion-status" role="status">{p.aircraft?.positionWarning?`Position quality: ${p.aircraft.positionWarning} · suspect fix excluded. ${liveMotionStatus(a,p.trail,Date.now(),p.reducedMotion,p.route,p.arrivalGeometry)}`:liveMotionStatus(a,p.trail,Date.now(),p.reducedMotion,p.route,p.arrivalGeometry)}{!p.modelReady&&view!=='area'&&view!=='route'&&<small>3D model not ready · aircraft marker retained</small>}</p>}
 {p.modelStage!=='primary'&&!demo&&<div className="model-recovery" role="status"><p>{p.modelStage==='fallback'?'Lightweight model · detailed model unavailable or slow':'Aircraft marker · 3D models unavailable or slow'}</p><button onClick={p.retryModel}>Retry detailed model</button></div>}
 {view!=='pilot'&&view!=='cabin'&&<label className="flight-distance">Camera distance<input aria-label="Flight camera distance" type="range" min="0.8" max="2.4" step="0.05" value={distance} onChange={e=>{setDistance(Number(e.target.value));if(view==='free')setView('side');}}/></label>}
 <div className="flight-details" hidden={compact}>
 <p className="flight-mobile-hint">Scroll for camera controls and location map ↓</p>
 <p>{demo?`${airport?.id} · runway ${runways[runway]?.id} · 45-second illustration`:endpoints?`${endpoints[0].iata||endpoints[0].icao} → ${endpoints[1].iata||endpoints[1].icao} · route`:'Origin / destination not verified'}</p>
 <p className="flight-airframe"><strong>{aircraftNames[a.aircraftType]??asset?.label??profileNames[fleetProfile(a.aircraftType)]}</strong> · {a.aircraftType||'type unavailable'}<br/>{airline(a)}</p>
 {asset?<details className="model-source"><summary>Aircraft model &amp; livery details</summary><p>3D model: {asset.label}{asset.match==='family'?' · family match; variant details may differ':''}<br/><small>{fullLivery(a)?'Full community airline livery · may depict historical paint.':fleetPaint(a.callsign)!=='neutral'?'Airline tail branding applied · other paint retains the source scheme.':'Community aircraft model · original source paint.'} Branding is illustrative, not a registration-specific livery. {demo?'This source has no verified gear rig; its gear pose stays fixed.':''}</small><br/><a href={'sourceRepository' in asset&&asset.sourceRepository?asset.sourceRepository:`https://github.com/${asset.id==='b39m'||asset.id==='b3xm'?'REXO-77/737-MAX':'Flightradar24/fr24-3d-models'}`} target="_blank" rel="noreferrer">Model author sources</a> · <a href={`${import.meta.env.BASE_URL}models/sourced/manifest.json`} target="_blank" rel="noreferrer">Licenses &amp; editable sources</a>{fullLivery(a)&&<> · <a href={`${import.meta.env.BASE_URL}models/sourced/liveries/manifest.json`} target="_blank" rel="noreferrer">Livery sources</a></>}</p></details>:<p className="model-source">{p.modelStage!=='primary'?'Detailed model unavailable or slow · lightweight approximate representation.':`Approximate fallback model · no sourced model is available for ${a.aircraftType||'this type'}.`} Paint is illustrative. Gear and wheel motion are presentation only.</p>}
 {!demo&&<p className="flight-location">{location?`${landing?'Near':'Reported position ·'} ${location.km} km ${location.direction} of ${location.city.name}, ${location.city.country}`:'City reference unavailable'}<br/><small>{(landing?presentation.lat:a.lat)?.toFixed(3)}°, {(landing?presentation.lon:a.lon)?.toFixed(3)}°</small></p>}
 {!demo&&<><div className="flight-readings"><span>{(landing?Math.round(presentation.altitude):a.altitude)?.toLocaleString()??'—'} <small>{landing?'ft':'ft reported'}</small></span><span>{(landing?Math.round(presentation.groundSpeed??0):a.groundSpeed)??'—'} <small>{landing?'kt':'kt reported'}</small></span></div></>}

 {!demo&&<PredictionDetails arrivalGeometry={p.arrivalGeometry} route={p.route} aircraft={a} points={p.trail} viewer={p.viewer} reduced={p.reducedMotion}/>}<CabinAudioSwitch source={{kind:'generated'}} suspended={p.suspended||compact||!!demo}/><CabinPassengers aircraft={a}/><AircraftIdentity aircraft={a} modelStage={p.modelStage}/>{!demo&&<><MotionDiagnostics arrivalGeometry={p.arrivalGeometry} route={p.route} aircraft={a} points={p.trail} now={Date.now()} reduced={p.reducedMotion} quality={p.quality} {...p.feedHealth}/><PassengerGeography aircraft={a} points={p.trail} cities={p.cities} now={Date.now()}/></>}
 {!demo&&<RouteOverview aircraft={a} route={p.route} trail={p.trail} now={Date.now()} loading={false} error="" showRoute={()=>{setView('route');p.onRoute();}}/>}
 <details><summary>Takeoff / landing demonstration</summary><p>Illustration at the selected airport, independent of this aircraft’s reported flight. No real takeoff, landing, runway assignment or gear state is implied. Uses an illustrative level runway at available map elevation; terrain is not surveyed.</p><label>Mapped runway <select value={runway} onChange={e=>{setRunway(Number(e.target.value));setProgress(0);setPlaying(false);}}>{runways.map((r,i)=><option key={i} value={i}>{airport?.id} · {r.id}</option>)}</select></label><div className="flight-buttons">{(['takeoff','landing'] as const).map(k=><button key={k} disabled={!runways.length} onClick={()=>{setDemo(k);setProgress(0);setPlaying(!p.reducedMotion);setView('side');}}>{k} demo</button>)}</div>{!runways.length&&<p>No mapped runway available.</p>}</details>
 {demo&&<div className="simulation-controls"><strong>SIMULATION · not live traffic</strong><label>Demonstration progress<input aria-label="Demonstration progress" type="range" min="0" max="1" step="0.001" value={progress} onChange={e=>{setProgress(Number(e.target.value));setPlaying(false);}}/></label><div className="flight-buttons"><button onClick={()=>setPlaying(!playing)}>{playing?'Pause':'Play'}</button><button onClick={()=>{setProgress(0);setPlaying(false);}}>Reset</button><button onClick={()=>{setDemo(null);setPlaying(false);setView('chase');}}>Return to observations</button></div></div>}
 </div><small>{view==='free'?'Free camera':'Camera locked · drag to release'}</small></section></>;
}
