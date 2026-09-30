import type {AudioFlight} from './cockpitAudio';
import {useEffect,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft,AirportGeometry,FlightRoute,TrailPoint} from '../types';
import {createWeatherMotion} from './weatherMotion';
import {aircraftBankRadians} from './aircraftAttitude';
import {surfaceHeight} from './surfaceHeight';
import {practicePose,stepPractice,type PracticeControls,type PracticePose} from './cockpit';
import {sharedLiveMotion} from './liveMotion';
import {aircraftViewpoint} from './flightViewpoints';
import {sourcedModel} from './flightPresentation';
interface MotionProps {viewer:Cesium.Viewer|null;aircraft:Aircraft;points:TrailPoint[];route:FlightRoute|null;arrival:AirportGeometry|null;reduced:boolean;suspended:boolean;}
/** Camera/physics remain in refs; React receives instrument snapshots at ~8 Hz. */
export function useCockpitMotion(p:MotionProps,practice:boolean,controls:PracticeControls){
 const [display,setDisplay]=useState(practicePose(p.aircraft));
 const [audioFlight,setAudioFlight]=useState<AudioFlight>({agl:null,ground:p.aircraft.ground,gear:null,at:Date.now()});
 const pose=useRef<PracticePose|null>(null),state=useRef({p,practice,controls});state.current={p,practice,controls};
 useEffect(()=>{const v=p.viewer;if(!v||v.isDestroyed())return;const C=window.Cesium,weatherMotion=createWeatherMotion();let last=0,ui=0,frame=0,retainedTerrain=0;const groundSurface=(lon:number,lat:number)=>{const value=v.scene.globe.getHeight(C.Cartographic.fromDegrees(lon,lat));if(typeof value==='number'&&Number.isFinite(value)&&value>=-430&&value<=8849)retainedTerrain=value;return retainedTerrain;};v.camera.cancelFlight();v.trackedEntity=undefined;
 // Match the display cadence; only instrument snapshots are throttled.
 const tick=(time:number)=>{frame=requestAnimationFrame(tick);const s=state.current;if(v.isDestroyed())return;if(document.hidden||s.p.suspended){last=0;return;}const dt=last?Math.min(.1,(time-last)/1000):0;last=time;let current:PracticePose,ground=s.p.aircraft.ground,arrivalOffset=0,groundClearance=0,landing=false,predictedGear:boolean|null=null;
 if(s.practice){const previous=pose.current??practicePose(s.p.aircraft),terrain=surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(previous.lon,previous.lat)));current=stepPractice(previous,s.controls,dt,terrain/.3048);pose.current=current;}
 else {const a=s.p.aircraft,fix=sharedLiveMotion.sample(a,s.p.points,Date.now(),s.p.reduced,s.p.route,s.p.arrival);ground=fix?.ground??a.ground;landing=!!fix?.landingPhase;groundClearance=(fix?.groundClearance??0)*.3048;if(fix?.gear!==undefined)predictedGear=fix.gear>=.99;else if(fix?.ground)predictedGear=true;if(fix?.simulationElevationFt!==undefined)arrivalOffset=fix.simulationElevationFt*.3048;else if(fix?.landingPhase)arrivalOffset=(fix?.arrivalElevationFt??s.p.arrival?.elevationFt??0)*.3048;current={...practicePose(a),...(fix?{lon:fix.lon,lat:fix.lat,altitude:fix.altitude,heading:fix.heading}:{}),pitch:0,bank:0,verticalRate:a.verticalRate??0};}
 const terrain=groundSurface(current.lon,current.lat),height=s.practice?current.altitude*.3048:ground?terrain+5+groundClearance:landing?terrain+Math.max(5,current.altitude*.3048-arrivalOffset):Math.max(terrain+5,current.altitude*.3048),point=aircraftViewpoint('front',sourcedModel(s.p.aircraft.aircraftType)?.length??40,current.heading),origin=C.Cartesian3.fromDegrees(current.lon,current.lat,height),matrix=C.Transforms.eastNorthUpToFixedFrame(origin),destination=C.Matrix4.multiplyByPoint(matrix,new C.Cartesian3(point.east,point.north,point.up),new C.Cartesian3());
 const rough=weatherMotion(v,current.lat,current.lon,current.altitude*.3048,ground||s.practice,s.p.reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches,time/1000);
 v.camera.lookAtTransform(C.Matrix4.IDENTITY);v.camera.setView({destination,orientation:{heading:current.heading*Math.PI/180,pitch:(current.pitch-3+rough.pitch*.6)*Math.PI/180,roll:aircraftBankRadians(current.bank+rough.roll*.6)}});v.scene.requestRender();if(time-ui>120){ui=time;setDisplay(current);const agl=s.practice?Math.max(0,current.altitude-terrain/.3048):s.p.arrival&&Number.isFinite(s.p.arrival.elevationFt)?Math.max(0,current.altitude-s.p.arrival.elevationFt!):null;setAudioFlight({turbulence:rough.strength,agl,ground:s.practice?agl!==null&&agl<=8.1:ground,gear:s.practice?s.controls.gear:predictedGear,at:Date.now()});}
 };frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[p.viewer]);
 return {display,audioFlight,pose};
}
