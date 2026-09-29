import {FloatingPanelControls} from './FloatingPanelControls';
import {FlightVoices} from './FlightVoices';
import {rotorRig} from '../lib/rotorAnimation';
import {ObservedFlightUpgrade} from './ObservedFlightUpgrade';
import {SimulatedFlightUpgrade} from './SimulatedFlightUpgrade';
import {createPortal} from 'react-dom';
import {ArrivalParkingLayer} from './ArrivalParkingLayer';
import {CockpitBoundary} from './CockpitBoundary';
import {CockpitView} from './CockpitView';
import {createWeatherMotion} from '../lib/weatherMotion';
import {aircraftModelAttitude} from '../lib/aircraftAttitude';
import {directedView,journeyPhase} from '../lib/arrivalExperience';
import {sceneViews,type FlightRequest,type FlightScene} from '../lib/watchDiscovery';
import {aircraftAnimation} from '../lib/aircraftAnimation';
import {sourcedGearClearance,gearCompression} from '../lib/landingGear';
import {applyAircraftRig} from '../lib/aircraftRig';
import {JourneyDetails} from './JourneyDetails';
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
import {sharedLiveMotion,liveFrame,liveMotionStatus} from '../lib/liveMotion';
import {AircraftIdentity} from './AircraftIdentity';
import {useEffect,useMemo,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft,AirportGeometry,TrailPoint,GeometryFile,FlightRoute} from '../types';
import {aircraftNames,airline} from '../lib/aircraft';
import {nearestCity,type City} from '../lib/cities';
import {profileNames,fullLivery,fleetUri,fallbackFleetUri,sourcedModel,fleetProfile,fleetPaint,runwayFrame} from '../lib/flightPresentation';
import {angleStep,flightFraming,illustrativeGear} from '../lib/flightVisuals';
import {ageSeconds} from '../lib/aircraft';
const profileLengths:Record<string,number>={b772:64,b788:57,b78x:68,a35k:74,e190:36,crj:36,pc12:14,a380:73,b747:71,b777:74,b787:63,a330:64,a350:67,b767:55,b757:47,bizjet:22,light:9,turboprop:23};
type View='route'|'chase'|'side'|'orbit'|'area'|'front'|'cockpit'|'cabin'|'bird'|'free'|'wing'|'tail'|'director';
interface Props {flightHost:HTMLElement|null;request:FlightRequest|null;onScene:(scene:FlightScene|null)=>void;observations:Aircraft[];arrivalGeometry:AirportGeometry|null;modelStage:'primary'|'fallback'|'marker';retryModel:()=>void;modelReady:boolean;suspended:boolean;quality:string;feedHealth:{error:string;updatedAt:number|null};cities:City[];onOpenChange:(open:boolean)=>void;navigationKey:string;viewer:Cesium.Viewer|null;aircraft:Aircraft|null;trail:TrailPoint[];geometry:GeometryFile|null;route:FlightRoute|null;reducedMotion:boolean;mode:'2D'|'3D';replay:boolean;onRoute:()=>void;}
export function FlightExperience(p:Props){
 const [open,setOpen]=useState(false),[view,setView]=useState<View>(()=>readFlightPreferences().view as View),[demo,setDemo]=useState<'takeoff'|'landing'|null>(null),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[runway,setRunway]=useState(0);
 const [savedCamera,setSavedCamera]=useState(()=>readFlightPreferences());
 const [side,setSide]=useState(()=>readFlightPreferences().side);
 const [cabinSide,setCabinSide]=useState<'left'|'right'>('right');
 const [distance,setDistance]=useState(()=>readFlightPreferences().distance),[compact,setCompact]=useState(()=>readFlightPreferences().compact);
 const panelRef=useRef<HTMLElement>(null);
 useEffect(()=>{saveFlightPreferences({distance,compact,side,...(['chase','side','orbit','area','front','cockpit','cabin','bird','wing','tail','director'].includes(view)?{view}:{})});},[view,distance,compact,side]);
 const state=useRef({p,open,view,demo,progress,playing,runway,distance,cabinSide,side});state.current={p,open,view,demo,progress,playing,runway,distance,cabinSide,side};
 const nearest=useMemo(()=>p.aircraft?.lon!=null&&p.aircraft?.lat!=null?nearestCity(p.cities,p.aircraft.lon,p.aircraft.lat):null,[p.cities,p.aircraft?.lon,p.aircraft?.lat]);
 useEffect(()=>{if(open&&p.aircraft&&!demo&&!p.replay)return sharedLiveMotion.watch(p.aircraft.hex);},[open,p.aircraft?.hex,demo,p.replay]);
 useEffect(()=>{p.onOpenChange(open);return()=>p.onOpenChange(false);},[open,p.onOpenChange]);
 const last=useRef(0),frame=useRef(0),elapsed=useRef(0);
 const eligible=p.aircraft?.targetKind==='aircraft'&&p.aircraft.lat!==null&&p.aircraft.lon!==null&&p.aircraft.altitude!==null;const airport=p.geometry?.airports[0];const runways=airport?.runways??[];
 useEffect(()=>{setOpen(false);setDemo(null);setPlaying(false);setProgress(0);},[p.aircraft?.hex,p.mode,p.replay,p.navigationKey]);
 const consumedRequest=useRef<number|null>(null);
 useEffect(()=>{const r=p.request;if(!r||r.serial===consumedRequest.current||r.hex!==p.aircraft?.hex||!p.viewer||!eligible||p.mode!=='3D'||p.replay)return;consumedRequest.current=r.serial;setView(sceneViews.includes(r.view as typeof sceneViews[number])?r.view as View:'side');setOpen(true);},[p.request,p.aircraft?.hex,p.viewer,eligible,p.mode,p.replay]);
 useEffect(()=>{if(open&&p.aircraft){try{localStorage.setItem('skyward.last-flight.v1',JSON.stringify({hex:p.aircraft.hex,label:p.aircraft.callsign||p.aircraft.registration||p.aircraft.hex}));}catch{}}p.onScene(open&&p.aircraft&&sceneViews.includes(view as typeof sceneViews[number])?{hex:p.aircraft.hex,view}:null);return()=>p.onScene(null);},[open,p.aircraft?.hex,view,p.onScene]);
 useEffect(()=>{if(p.reducedMotion)setPlaying(false);},[p.reducedMotion]);
 useEffect(()=>{
  const candidate=p.viewer;if(!candidate||!open||p.mode!=='3D'||p.replay)return;const v=candidate,original=p.aircraft,C=window.Cesium;
  const returnPose={destination:C.Cartesian3.clone(v.camera.positionWC),orientation:{direction:C.Cartesian3.clone(v.camera.directionWC),up:C.Cartesian3.clone(v.camera.upWC)}};const entryNavigation=p.navigationKey;
  v.camera.cancelFlight();v.trackedEntity=undefined;last.current=0;const originalNear=v.camera.frustum.near,controller=v.scene.screenSpaceCameraController,originalCollision=controller.enableCollisionDetection;let retainedSurface=0,retainedFloor=25;
  const groundSurface=(lon:number,lat:number)=>{const sample=v.scene.globe.getHeight(C.Cartographic.fromDegrees(lon,lat));if(typeof sample==='number'&&Number.isFinite(sample)&&sample>=-430&&sample<=8849)retainedSurface=sample;return retainedSurface;};
  const release=()=>{if(state.current.view==='cockpit')return;previousView='free';setView('free');};v.canvas.addEventListener('pointerdown',release);v.canvas.addEventListener('wheel',release);v.canvas.addEventListener('keydown',release);
  const hidden=()=>{if(document.hidden||state.current.p.suspended)setPlaying(false);last.current=0;};document.addEventListener('visibilitychange',hidden);
  let shown:Cesium.Entity|undefined,drawn='',cameraAngle=original?.heading??0,cameraRange=0,layoutDirty=true,box:{left:number;top:number;right:number;bottom:number}|null=null;
  const layout=()=>{const canvas=v.canvas.getBoundingClientRect(),panel=panelRef.current?.getBoundingClientRect();box=panel?{left:panel.left-canvas.left,top:panel.top-canvas.top,right:panel.right-canvas.left,bottom:panel.bottom-canvas.top}:null;layoutDirty=true;};
  const observedPanel=panelRef.current;observedPanel?.addEventListener('panelpositionchange',layout);
  const resize=new ResizeObserver(layout);resize.observe(v.canvas);if(panelRef.current)resize.observe(panelRef.current);layout();
  function gear(entity:Cesium.Entity,a:Aircraft,amount:number,speed:number,moving:boolean,heading?:number,flaps=amount*.5,ground=false){
   if(!entity.model)return;
   applyAircraftRig(entity,elapsed.current,moving||sourcedModel(a.aircraftType)?speed:0,amount,0,flaps,heading,ground,!!state.current.p.reducedMotion);
  }
  let previousView:View='free',reattachTime=0;
  let fromPosition=C.Cartesian3.clone(v.camera.positionWC),fromDirection=C.Cartesian3.clone(v.camera.directionWC),fromUp=C.Cartesian3.clone(v.camera.upWC);
  function camera(pos:Cesium.Cartesian3,heading:number,view:View,dt:number){
   const s=state.current;
   if(previousView!==view){reattachTime=0;fromPosition=C.Cartesian3.clone(v.camera.positionWC);fromDirection=C.Cartesian3.clone(v.camera.directionWC);fromUp=C.Cartesian3.clone(v.camera.upWC);}previousView=view;reattachTime+=dt;
   const length=sourcedModel(s.p.aircraft?.aircraftType??'')?.length??profileLengths[fleetProfile(s.p.aircraft?.aircraftType??'')]??40;
   const framing=flightFraming(v.canvas.clientWidth,v.canvas.clientHeight,box,length,s.distance,(v.camera.frustum as Cesium.PerspectiveFrustum).fov??Math.PI/3);
   const targetAngle=view==='area'?0:heading+(view==='side'?(s.side==='left'?90:-90):view==='orbit'?elapsed.current*(s.p.reducedMotion?0:8):0),targetRange=view==='area'?180000:framing.range*(view==='bird'?1.3:view==='tail'?.95:1);
   const blend=s.p.reducedMotion?1:1-Math.exp(-dt*7);cameraAngle=angleStep(cameraAngle,targetAngle,blend);cameraRange=cameraRange?cameraRange+(targetRange-cameraRange)*blend:targetRange;
   const onboard=view==='front'||view==='cabin'||view==='wing';v.camera.frustum.near=onboard?.2:originalNear;
   if(onboard){
    const point=aircraftViewpoint(view,length,heading,view==='wing'?(s.side==='right'?'right':'left'):s.cabinSide),enu=C.Transforms.eastNorthUpToFixedFrame(pos);
    const destination=C.Matrix4.multiplyByPoint(enu,new C.Cartesian3(point.east,point.north,point.up),new C.Cartesian3());
    v.camera.lookAtTransform(C.Matrix4.IDENTITY);v.camera.setView({destination,orientation:{heading:point.heading,pitch:point.pitch,roll:0}});
   }else{
    v.camera.lookAt(pos,new C.HeadingPitchRange(cameraAngle*Math.PI/180,view==='area'?-Math.PI/2:view==='bird'?-1.35:view==='tail'?-.3:-.18,cameraRange));v.camera.lookAtTransform(C.Matrix4.IDENTITY);
   }
   const blendBack=reattachBlend(reattachTime,s.p.reducedMotion);
   if(blendBack<1){
    const dest=C.Cartesian3.lerp(fromPosition,v.camera.positionWC,blendBack,new C.Cartesian3());
    const direction=C.Cartesian3.lerp(fromDirection,v.camera.directionWC,blendBack,new C.Cartesian3()),up=C.Cartesian3.lerp(fromUp,v.camera.upWC,blendBack,new C.Cartesian3());
    // Avoid degenerate direction/up vectors while recovering from a reversed camera.
    if(C.Cartesian3.magnitudeSquared(direction)>.0001&&C.Cartesian3.magnitudeSquared(C.Cartesian3.cross(direction,up,new C.Cartesian3()))>.0001)v.camera.setView({destination:dest,orientation:{direction:C.Cartesian3.normalize(direction,direction),up:C.Cartesian3.normalize(up,up)}});
   }
   const cart=v.camera.positionCartographic,height=v.scene.globe.getHeight(cart);if(typeof height==='number'&&Number.isFinite(height))retainedFloor=cameraFloor(height);const floor=retainedFloor;
   if(cart.height<floor){const destination=C.Cartesian3.fromRadians(cart.longitude,cart.latitude,floor);v.camera.setView({destination,orientation:{direction:C.Cartesian3.clone(v.camera.directionWC),up:C.Cartesian3.clone(v.camera.upWC)}});}
   // Compose by rotating the view, not by lowering the camera toward the runway.
   // Terrain safety previously reset the aim to screen center, alternating with
   // panel-aware framing at touchdown and hiding the aircraft behind the panel.
   if(!onboard&&view!=='area'){
    const destination=C.Cartesian3.clone(v.camera.positionWC),direction=C.Cartesian3.subtract(pos,destination,new C.Cartesian3()),up=C.Ellipsoid.WGS84.geodeticSurfaceNormal(destination,new C.Cartesian3());
    if(C.Cartesian3.magnitudeSquared(direction)>.001&&C.Cartesian3.magnitudeSquared(C.Cartesian3.cross(direction,up,new C.Cartesian3()))>.001){
     v.camera.setView({destination,orientation:{direction:C.Cartesian3.normalize(direction,direction),up}});
     const y=(1-2*framing.cy/v.canvas.clientHeight)*Math.tan(framing.vfov/2),x=(2*framing.cx/v.canvas.clientWidth-1)*Math.tan(framing.vfov/2)*v.canvas.clientWidth/v.canvas.clientHeight;
     v.camera.lookRight(-Math.atan(x));v.camera.lookUp(-Math.atan(y));
    }
   }
   return blendBack<1||Math.abs(targetRange-cameraRange)>.05||Math.abs(((targetAngle-cameraAngle+540)%360)-180)>.02;
  }
  let cameraMoving=true;const motion=sharedLiveMotion,weatherMotion=createWeatherMotion();
  const tick=(now:number)=>{
   if(v.isDestroyed())return;frame.current=requestAnimationFrame(tick);if(document.hidden||state.current.p.suspended)return;if(last.current&&now-last.current<33)return;
   const s=state.current;controller.enableCollisionDetection=s.view==='free'||s.view==='route'?originalCollision:false;const dt=last.current?Math.min(.1,(now-last.current)/1000):.033;last.current=now;elapsed.current+=dt;
   let fraction=s.progress;if(s.demo&&s.playing){fraction=Math.min(1,fraction+dt/45);state.current.progress=fraction;setProgress(fraction);if(fraction===1)setPlaying(false);}
   const a=s.p.aircraft;if(!a)return;const r=s.p.geometry?.airports[0]?.runways[s.runway],actual=v.entities.getById(`aircraft-${a.hex}`);if(actual)actual.show=!s.demo&&s.view!=='cockpit';
   const fix=s.demo&&r?runwayFrame(r,s.demo,fraction):motion.sample(a,s.p.trail,Date.now(),s.p.reducedMotion,s.p.route,s.p.arrivalGeometry??(a.ground?s.p.geometry?.airports[0]:null));
   let heading=a.heading??0,pitch=0;if(fix&&'heading' in fix&&typeof fix.heading==='number')heading=fix.heading;if(fix&&'pitch' in fix)pitch=fix.pitch??0;
   const animation=actual&&fix?aircraftAnimation.sample(actual,{...fix,heading,groundSpeed:('groundSpeed' in fix?fix.groundSpeed:a.groundSpeed)??0},Date.now(),s.p.reducedMotion):{bank:0,gear:a.ground?1:0,flaps:0};
   const rough=weatherMotion(v,fix?.lat??a.lat??0,fix?.lon??a.lon??0,(fix?.altitude??a.altitude??0)*.3048,(fix?.ground??a.ground)||!!s.demo,!!s.p.reducedMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches,now/1000);
   const movingWheels=!s.p.reducedMotion&&(!sourcedModel(a.aircraftType)||s.p.modelStage==='fallback')&&(s.demo?!!fix?.ground:(!!fix?.ground&&(!!fix&&'landingPhase' in fix&&!!fix.landingPhase||ageSeconds(a,Date.now())<=30)))&&(s.demo?s.playing:((fix&&'groundSpeed' in fix?fix.groundSpeed:a.groundSpeed)??0)>0);
   const key=JSON.stringify([fix?.lon,fix?.lat,fix?.altitude,fix&&'groundClearance' in fix?fix.groundClearance:0,heading,pitch,rough.roll,rough.pitch,a.callsign,a.aircraftType,a.ground,s.demo,s.view,s.cabinSide,s.side,s.distance,s.p.reducedMotion,fraction,gearCompression(s.demo?shown:actual)]);
   if(!rotorRig(String(actual?.model?.uri?.getValue(v.clock.currentTime)??''))&&rough.strength<.001&&key===drawn&&!cameraMoving&&!layoutDirty&&!movingWheels&&!(s.view==='orbit'&&!s.p.reducedMotion))return;drawn=key;layoutDirty=false;
   let position=actual?.position?.getValue(v.clock.currentTime);
   if(fix){
    const landing='landingPhase' in fix&&!!fix.landingPhase;
    const ground=fix&&'simulationElevationFt' in fix&&fix.simulationElevationFt!==undefined?groundSurface(fix.lon,fix.lat)-fix.simulationElevationFt*.3048:s.demo&&r?(groundSurface(r.a[0],r.a[1])):landing?(groundSurface(fix.lon,fix.lat))-(('arrivalElevationFt' in fix?fix.arrivalElevationFt:undefined)??s.p.arrivalGeometry?.elevationFt??0)*.3048:fix.ground?(groundSurface(fix.lon,fix.lat))-Math.max(0,fix.altitude)*.3048:0;
    position=C.Cartesian3.fromDegrees(fix.lon,fix.lat,ground+Math.max(0,fix.altitude)*.3048+('groundClearance' in fix?(fix.groundClearance??0)*.3048:0)+(s.p.modelStage==='primary'?sourcedGearClearance(a.aircraftType):5)-gearCompression(s.demo?shown:actual));
    if(s.demo){
     if(!shown)shown=v.entities.add({id:'flight-simulation',model:{uri:import.meta.env.BASE_URL+(s.p.modelStage==='primary'?fleetUri(a):fallbackFleetUri(a)),minimumPixelSize:0,maximumScale:1,heightReference:C.HeightReference.NONE,shadows:C.ShadowMode.ENABLED},label:{text:'SIMULATION',font:'bold 14px sans-serif',fillColor:C.Color.ORANGE,pixelOffset:new C.Cartesian2(0,-65)}});
     if(shown.model?.uri?.getValue(v.clock.currentTime)!==import.meta.env.BASE_URL+(s.p.modelStage==='primary'?fleetUri(a):fallbackFleetUri(a)))shown.model!.uri=new C.ConstantProperty(import.meta.env.BASE_URL+(s.p.modelStage==='primary'?fleetUri(a):fallbackFleetUri(a)));
     gear(shown,a,illustrativeGear(s.demo,fraction),s.demo==='takeoff'?fraction*220:(1-fraction)*140,movingWheels,heading,illustrativeGear(s.demo,fraction)*.5,!!fix.ground);
     shown.position=new C.ConstantPositionProperty(position);shown.orientation=new C.ConstantProperty(C.Transforms.headingPitchRollQuaternion(position,new C.HeadingPitchRoll((heading-90)*Math.PI/180,pitch*Math.PI/180,0)));
    }else{
     if(shown){v.entities.remove(shown);shown=undefined;}
     if(actual){if(actual.model)actual.model.heightReference=new C.ConstantProperty(C.HeightReference.NONE);if(actual.billboard)actual.billboard.heightReference=new C.ConstantProperty(C.HeightReference.NONE);actual.position=new C.ConstantPositionProperty(position);actual.orientation=new C.ConstantProperty(C.Transforms.headingPitchRollQuaternion(position,new C.HeadingPitchRoll(...aircraftModelAttitude(heading,pitch+rough.pitch,animation.bank+rough.roll))));}
    }
   }
   if(!s.demo&&actual)gear(actual,a,animation.gear,fix&&'groundSpeed' in fix?fix.groundSpeed??0:a.groundSpeed??0,movingWheels,heading,animation.flaps,!!fix?.ground);
   if(s.view==='cockpit')v.camera.frustum.near=.2;else if(s.view!=='front'&&s.view!=='cabin'&&s.view!=='wing'&&s.view!=='tail')v.camera.frustum.near=originalNear;
   if(s.view==='free')previousView='free';
   cameraMoving=!!position&&s.view!=='free'&&s.view!=='route'&&s.view!=='cockpit'?camera(position!,heading,s.view==='director'?directedView(fix&&'landingPhase' in fix&&fix.landingPhase?fix.landingPhase:fix?.ground?'taxi':undefined):s.view,dt):false;if(['front','cabin','wing','tail'].includes(s.view)&&rough.strength>.001){v.camera.lookUp(rough.pitch*Math.PI/180*.5);v.camera.twistRight(rough.roll*Math.PI/180*.5);}v.scene.requestRender();
  };
  frame.current=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame.current);resize.disconnect();observedPanel?.removeEventListener('panelpositionchange',layout);v.canvas.removeEventListener('pointerdown',release);v.canvas.removeEventListener('wheel',release);v.canvas.removeEventListener('keydown',release);document.removeEventListener('visibilitychange',hidden);if(!v.isDestroyed()){controller.enableCollisionDetection=originalCollision;v.camera.frustum.near=originalNear;if(shown)v.entities.remove(shown);const a=state.current.p.aircraft?.hex===original?.hex?state.current.p.aircraft:original,e=a&&v.entities.getById(`aircraft-${a.hex}`);if(e&&a){e.show=true;gear(e,a,a.ground?1:0,0,false);}v.camera.lookAtTransform(C.Matrix4.IDENTITY);if(!state.current.open&&state.current.p.mode==='3D'&&!state.current.p.replay&&state.current.p.navigationKey===entryNavigation){v.camera.cancelFlight();v.camera.setView(returnPose);}v.scene.requestRender();}};
 },[p.viewer,open,p.mode,p.replay]);

 if(!eligible||p.mode!=='3D'||p.replay)return null;
 if(!open){const trigger=<button className="flight-view-trigger" title="Follow this aircraft in 3D" onClick={()=>{setView('side');setOpen(true);}}>✈ Flight view</button>;return p.flightHost?createPortal(trigger,p.flightHost):trigger;}
 const a=p.aircraft!;const presentation=sharedLiveMotion.displayed(a.hex)??liveFrame(a,p.trail,Date.now(),p.reducedMotion,p.route,p.arrivalGeometry);const landing=!!presentation?.landingPhase;const location=landing?nearestCity(p.cities,presentation.lon,presentation.lat):nearest;const asset=p.modelStage==='primary'?sourcedModel(a.aircraftType):null;const route=p.route;const endpoints=route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status)&&route.airports.length===2?route.airports:null;
 return <><ArrivalParkingLayer viewer={p.viewer} hex={a.hex} enabled={!demo}/>{view==='cockpit'&&<CockpitBoundary key={a.hex} onExit={()=>setView('side')}><CockpitView observations={p.observations} viewer={p.viewer} aircraft={a} points={p.trail} route={p.route} arrival={p.arrivalGeometry} reduced={p.reducedMotion} suspended={p.suspended} front={()=>setView('front')} side={()=>setView('side')} close={()=>setOpen(false)}/></CockpitBoundary>}<RouteLayer viewer={p.viewer} aircraft={a} route={route} trail={p.trail} active={view==='route'&&!demo}/><section ref={panelRef} className={`flight-experience${view==='cockpit'?' cockpit-sidebar':''}${compact?' flight-compact':''}`} aria-label="Passenger flight view"><FloatingPanelControls title={a.callsign||a.registration||'Flight view'}/><SheetHandle rememberFlight/><header>{(a.simulation||fleetPaint(a.callsign)!=='neutral')&&<img className="flight-airline-logo" src={`${import.meta.env.BASE_URL}airlines/${a.simulation?'SKYWARD':fleetPaint(a.callsign)}.png`} alt={`${airline(a)} logo`} onError={e=>{e.currentTarget.style.display='none';}}/>}<strong>{demo?'SIMULATION · '+demo.toUpperCase():a.simulation?'Skyward · Simulated · '+a.callsign:a.callsign||a.registration||a.hex}</strong><button aria-label={compact?'Expand flight details':'Collapse flight details'} onClick={()=>setCompact(!compact)}>{compact?'+':'−'}</button><button aria-label="Close flight view" onClick={()=>{setOpen(false);setDemo(null);setPlaying(false);}}>×</button></header>
 {view!=='cockpit'&&!demo&&!p.replay&&(a.simulation?<SimulatedFlightUpgrade/>:<ObservedFlightUpgrade aircraft={a} arrival={!!presentation?.arrivalAnimation}/>)}
 {view!=='cockpit'&&<div className="flight-quick-controls"><CabinAudioSwitch viewer={p.viewer} aircraftType={a.aircraftType??undefined} ground={presentation?.ground??a.ground} speed={presentation?.groundSpeed??a.groundSpeed??0} phase={presentation?.landingPhase} source={{kind:'generated'}} suspended={p.suspended||!!demo}/></div>}
 <FlightVoices cockpit={view==='cockpit'} key={a.hex} identity={a.hex} viewer={p.viewer} lat={a.lat} lon={a.lon} suspended={p.suspended||!!demo} context={{callsign:a.callsign,from:route?.callsign===a.callsign?endpoints?.[0].name:undefined,to:route?.callsign===a.callsign?endpoints?.[1].name:undefined,phase:presentation?.landingPhase??(a.ground?'ground':'airborne'),altitude:a.altitude}}/>
 {view==='free'&&<button className="resume-flight-camera" onClick={()=>setView('chase')}>Resume flight camera</button>}<div className="flight-buttons">{(['chase','front','cockpit','cabin','bird','side','wing','tail','director','orbit','area','free'] as View[]).map(v=><button key={v} aria-pressed={view===v} onClick={()=>{if(v==='cockpit'){setDemo(null);setPlaying(false);}setView(v);}}>{v==='front'?'Front view':v==='cockpit'?'Pilot cockpit':v==='cabin'?'Cabin':v==='bird'?'Bird’s-eye':v==='wing'?'Wing view':v==='tail'?'Tail view':v==='director'?'Landing director':v}</button>)}<button disabled={!endpoints||!!demo} onClick={()=>{setView('route');p.onRoute();}}>Route</button></div>
 {(view==='side'||view==='wing')&&<div className="flight-buttons" role="group" aria-label="Aircraft side view">{(['left','right'] as const).map(option=><button key={option} aria-pressed={side===option} onClick={()=>setSide(option)}>{option==='left'?'Left side':'Right side'}</button>)}</div>}
 <div className="flight-buttons" aria-label="Saved flight camera"><button disabled={['free','route','cockpit','director','area'].includes(view)} onClick={()=>{const next={...readFlightPreferences(),savedView:view,savedSide:side,savedDistance:distance};saveFlightPreferences(next);setSavedCamera(next);}}>Save camera</button><button onClick={()=>{setView(savedCamera.savedView as View);setSide(savedCamera.savedSide);setDistance(savedCamera.savedDistance);}}>Restore camera</button></div>
 {view==='director'&&<p className="flight-viewpoint-note">Automatic approach, touchdown and taxi cameras. Select another view or drag to take control.</p>}
 {view==='front'&&<p className="flight-viewpoint-note">Unobstructed front view along the flight track.</p>}
 {view==='cabin'&&<><div className="flight-buttons" aria-label="Cabin window side">{(['left','right'] as const).map(side=><button key={side} aria-pressed={cabinSide===side} onClick={()=>setCabinSide(side)}>{side==='left'?'Left window':'Right window'}</button>)}</div><p className="flight-viewpoint-note">Window-side view beside the aircraft · approximate seat position, no modeled cabin interior.</p></>}
 {view==='bird'&&<p className="flight-viewpoint-note">Following above the aircraft, aligned with its heading.</p>}
 {!demo&&presentation?.arrivalAnimation&&<button className="quiet-button" onClick={()=>sharedLiveMotion.stopArrival(a.hex)}>Return to live tracking</button>}
 {!demo&&<p className="flight-motion-status" role="status">{p.aircraft?.positionWarning?`Position quality: ${p.aircraft.positionWarning} · suspect fix excluded. ${liveMotionStatus(a,p.trail,Date.now(),p.reducedMotion,p.route,p.arrivalGeometry,presentation)}`:liveMotionStatus(a,p.trail,Date.now(),p.reducedMotion,p.route,p.arrivalGeometry,presentation)}{!p.modelReady&&view!=='area'&&view!=='route'&&<small>3D model not ready · aircraft marker retained</small>}</p>}
 {p.modelStage!=='primary'&&!demo&&<div className="model-recovery" role="status"><p>{p.modelStage==='fallback'?'Lightweight model · detailed model unavailable or slow':'Aircraft marker · 3D models unavailable or slow'}</p><button onClick={p.retryModel}>Retry detailed model</button></div>}
 {view!=='front'&&view!=='cabin'&&<label className="flight-distance">Camera distance<input aria-label="Flight camera distance" type="range" min="0.8" max="2.4" step="0.05" value={distance} onChange={e=>{setDistance(Number(e.target.value));if(view==='free')setView('side');}}/></label>}
 <div className="flight-details" hidden={compact}>
 <p className="flight-mobile-hint">Scroll for camera controls and location map ↓</p>
 <p>{demo?`${airport?.id} · runway ${runways[runway]?.id} · 45-second illustration`:endpoints?`${endpoints[0].iata||endpoints[0].icao} → ${endpoints[1].iata||endpoints[1].icao} · route`:'Origin / destination not verified'}</p>
 <p className="flight-airframe"><strong>{aircraftNames[a.aircraftType]??asset?.label??profileNames[fleetProfile(a.aircraftType)]}</strong> · {a.aircraftType||'type unavailable'}<br/>{airline(a)}</p>
 {a.simulation?<p className="model-source">Skyward paint and tail logo · fictional aircraft using the same detailed airframe and flight controls.</p>:asset?<details className="model-source"><summary>Aircraft model &amp; livery details</summary><p>3D model: {asset.label}{asset.match==='family'?' · family match; variant details may differ':''}<br/><small>{fullLivery(a)?'Full community airline livery · may depict historical paint.':fleetPaint(a.callsign)!=='neutral'?'Airline tail branding applied · other paint retains the source scheme.':'Community aircraft model · original source paint.'} Branding is illustrative, not a registration-specific livery. Gear deployment is illustrative; live gear configuration is unavailable.</small><br/><a href={'sourceRepository' in asset&&asset.sourceRepository?asset.sourceRepository:`https://github.com/${asset.id==='b39m'||asset.id==='b3xm'?'REXO-77/737-MAX':'Flightradar24/fr24-3d-models'}`} target="_blank" rel="noreferrer">Model author sources</a> · <a href={`${import.meta.env.BASE_URL}models/sourced/manifest.json`} target="_blank" rel="noreferrer">Licenses &amp; editable sources</a>{fullLivery(a)&&<> · <a href={`${import.meta.env.BASE_URL}models/sourced/liveries/manifest.json`} target="_blank" rel="noreferrer">Livery sources</a></>}</p></details>:<p className="model-source">{p.modelStage!=='primary'?'Detailed model unavailable or slow · lightweight approximate representation.':`Approximate fallback model · no sourced model is available for ${a.aircraftType||'this type'}.`} Paint is illustrative. Gear and wheel motion are presentation only.</p>}
 {!demo&&<p className="flight-location">{location?`${a.simulation?'Simulated position ·':landing?'Near':'Reported position ·'} ${location.km} km ${location.direction} of ${location.city.name}, ${location.city.country}`:'City reference unavailable'}<br/><small>{(landing?presentation.lat:a.lat)?.toFixed(3)}°, {(landing?presentation.lon:a.lon)?.toFixed(3)}°</small></p>}
 {!demo&&<><div className="flight-readings"><span>{(landing?Math.round(presentation.altitude):a.altitude)?.toLocaleString()??'—'} <small>{a.simulation||landing?'ft':'ft reported'}</small></span><span>{(landing?Math.round(presentation.groundSpeed??0):a.groundSpeed)??'—'} <small>{a.simulation||landing?'kt':'kt reported'}</small></span></div></>}

 {!a.simulation&&!demo&&<PredictionDetails arrivalGeometry={p.arrivalGeometry} route={p.route} aircraft={a} points={p.trail} viewer={p.viewer} reduced={p.reducedMotion}/>}
 {!demo&&<RouteOverview aircraft={a} route={p.route} trail={p.trail} now={Date.now()} loading={false} error="" showRoute={()=>{setView('route');p.onRoute();}}/>}
 {!demo&&<details className="journey-timeline"><summary>Journey timeline · {journeyPhase(a,presentation,p.trail).phase}</summary><ol aria-label="Flight journey stages">{['Departure / climb','Cruise','Descent','Arrival','Taxi','Parked'].map(phase=><li key={phase} aria-current={journeyPhase(a,presentation,p.trail).phase===phase?'step':undefined}>{phase}{journeyPhase(a,presentation,p.trail).phase===phase?' · current':''}</li>)}</ol><small>{journeyPhase(a,presentation,p.trail).basis}. {a.simulation?'Fictional journey stages.':'Unobserved stages are not confirmed or timestamped.'}</small></details>}
 <CabinPassengers aircraft={a}/><AircraftIdentity aircraft={a} modelStage={p.modelStage}/>{!demo&&<><MotionDiagnostics arrivalGeometry={p.arrivalGeometry} route={p.route} aircraft={a} points={p.trail} now={Date.now()} reduced={p.reducedMotion} quality={p.quality} {...p.feedHealth}/><PassengerGeography aircraft={a} points={p.trail} cities={p.cities} now={Date.now()}/></>}
 {!demo&&<JourneyDetails reducedMotion={p.reducedMotion} key={a.hex} aircraft={a} route={p.route} trail={p.trail} now={Date.now()}/>}
 <details><summary>Takeoff / landing demonstration</summary><p>Illustration at the selected airport, independent of this aircraft’s reported flight. No real takeoff, landing, runway assignment or gear state is implied. Uses an illustrative level runway at available map elevation; terrain is not surveyed.</p><label>Mapped runway <select value={runway} onChange={e=>{setRunway(Number(e.target.value));setProgress(0);setPlaying(false);}}>{runways.map((r,i)=><option key={i} value={i}>{airport?.id} · {r.id}</option>)}</select></label><div className="flight-buttons">{(['takeoff','landing'] as const).map(k=><button key={k} disabled={!runways.length} onClick={()=>{setDemo(k);setProgress(0);setPlaying(!p.reducedMotion);setView('side');}}>{k} demo</button>)}</div>{!runways.length&&<p>No mapped runway available.</p>}</details>
 {demo&&<div className="simulation-controls"><strong>SIMULATION · not live traffic</strong><label>Demonstration progress<input aria-label="Demonstration progress" type="range" min="0" max="1" step="0.001" value={progress} onChange={e=>{setProgress(Number(e.target.value));setPlaying(false);}}/></label><div className="flight-buttons"><button onClick={()=>setPlaying(!playing)}>{playing?'Pause':'Play'}</button><button onClick={()=>{setProgress(0);setPlaying(false);}}>Reset</button><button onClick={()=>{setDemo(null);setPlaying(false);setView('chase');}}>Return to observations</button></div></div>}
 </div><small>{view==='free'?'Free camera':'Camera locked · drag to release'}</small></section></>;
}
