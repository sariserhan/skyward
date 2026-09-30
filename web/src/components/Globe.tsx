import {updateGraphics} from '../lib/updateGraphics';
import {FollowFlightPath} from './FollowFlightPath';
import {retainMapCredit,osmCredit} from '../lib/mapCredits';
import {createGlobalBasemap} from '../lib/globalBasemap';
import {sceneryAhead} from '../lib/sceneryAhead';
import {buildingAppearance} from '../lib/buildingAppearance';
import {createModelWarmup} from '../lib/sceneWarmup';
import {rotorRig} from '../lib/rotorAnimation';
import {installTouchdownEffects} from '../lib/touchdownEffects';
import {readCabinAudio} from '../lib/cabinAudio';
import {WaterSurface} from './WaterSurface';
import {CityBuildings} from './CityBuildings';
import {airportBuildingHeight,airportPolygonHierarchy} from '../lib/airportBuildings';
import {WeatherLayer} from './WeatherLayer';
import {aircraftModelAttitude} from '../lib/aircraftAttitude';
import {loadGeography} from '../lib/geographyLoader';
import {SkyBoundary} from './SkyBoundary';
import type {FlightRequest,FlightScene} from '../lib/watchDiscovery';
import {aircraftAnimation} from '../lib/aircraftAnimation';
import {AirportDetailLayer} from './AirportDetailLayer';
import {installRenderDiagnostics,modelLoadStats,readRenderStats} from '../lib/renderDiagnostics';
import {surfaceHeight} from '../lib/surfaceHeight';
import airportElevations from '../../data/airport-elevations.json';
import {applyAircraftRig} from '../lib/aircraftRig';
import {renderFailure} from '../lib/sessionHealth';
import {installArrivalSpin} from '../lib/arrivalSpin';
import {hasBaseImagery} from '../lib/nightMap';
import {installAircraftLights} from '../lib/aircraftLights';
import {installLandingGear,sourcedGearClearance,gearCompression} from '../lib/landingGear';
import {installSolarLighting,sunDirectionFixed} from '../lib/solarLighting';
import {trackDistance,coloredTrail} from '../lib/positionQuality';
import {RouteMode} from './RouteMode';
import {routeArc} from '../lib/routeOverview';
import {failedModel,modelTimedOut,modelUri,type ModelAttempt} from '../lib/modelRecovery';
import {createPortal} from 'react-dom';
import {aircraftFreshness} from '../lib/aircraftFreshness';
import {RouteLayer} from './RouteLayer';
import {CameraBookmarks} from './CameraBookmarks';
import {PerformanceMonitor} from './PerformanceMonitor';
import {SpotterCamera,type SpotterCameraMode} from './SpotterCamera';
import {DensityLayer} from './DensityLayer';
import {SessionReplayLayer} from './SessionReplay';
import type {Recording} from '../lib/sessionRecording';
import type {DensityCell} from '../lib/density';
// Stable geometry identity keeps mapped taxi routing cached across animation frames.
const elevationGeometryCache=new WeakMap<AirportGeometry,AirportGeometry>();
function withAirportElevation(airport:AirportGeometry){
 if(airport.elevationFt!==undefined)return airport;
 let mapped=elevationGeometryCache.get(airport);
 if(!mapped){mapped={...airport,elevationFt:(airportElevations as Record<string,number>)[airport.id]};elevationGeometryCache.set(airport,mapped);}
 return mapped;
}
export interface RecoveryPose {lon:number;lat:number;height:number;heading:number;pitch:number;roll:number;}
import {suggestedQuality,type Quality} from '../lib/adaptiveQuality';
import {nearbyModelIds,modelBudget,modelRange,modelOpacity} from '../lib/modelBudget';
import {TowerView} from './TowerView';
import {sharedLiveMotion} from '../lib/liveMotion';
import {airportPoints,type Movement} from '../lib/exploration';
import {ResolutionGovernor} from '../lib/resolutionGovernor';
import {qualityEvent} from '../lib/qualityEvents';
import { createOpenTerrain } from '../lib/openTerrain';
import { addTerrainAirport } from '../lib/terrainAirport';
import { fleetUri,fallbackFleetUri,sourcedModel } from '../lib/flightPresentation';
import {cameraArea,areaKey,type CameraArea} from '../lib/cameraTraffic';
import {AtlasLayer} from './AtlasLayer';
import {CityLabels} from './CityLabels';
import type {City} from '../lib/cities';

import type { MapPreferences } from '../lib/mapPreferences';
import { useEffect, useRef, useState, useMemo, lazy, Suspense } from 'react';
const FlightExperience=lazy(()=>import('./FlightExperience').then(m=>({default:m.FlightExperience})));
const CelestialSky=lazy(()=>import('./CelestialSky'));
import type * as Cesium from 'cesium';
import type { AirportGeometry, Aircraft, CameraTarget, GeometryFile, TrailPoint, AirportId, FacilityTarget, MapCommand, FlightRoute } from '../types';
import { airportFacilities } from './AirportInspector';
import { AIRPORTS } from '../types';
import { ageSeconds, hasPosition } from '../lib/aircraft';

interface Props {flightHost:HTMLElement|null;flightRequest:FlightRequest|null;onFlightScene:(scene:FlightScene|null)=>void;groundObservations:Aircraft[];groundAnimation:boolean;closeGround:()=>void;onViewer:(v:Cesium.Viewer|null)=>void;arrivalGeometry:AirportGeometry|null;exitRoute:()=>void;toolsHost:HTMLElement|null;automatic:string|null;spotterMode:SpotterCameraMode|null;spotterPaused:boolean;bookmarkRestore:Parameters<typeof CameraBookmarks>[0]['restore'];obscured:boolean;recoveryPose:RecoveryPose|null;recover:(pose:RecoveryPose|null,manual?:boolean)=>boolean;density:DensityCell[]|null;playback:{recording:Recording;time:number}|null;feedHealth:{error:string;updatedAt:number|null};onAutomaticQuality:(quality:Quality)=>void; histories:Map<string,TrailPoint[]>; onTrafficArea:(area:CameraArea|null)=>void; movements:Movement[]; preferences: MapPreferences; aircraft: Aircraft[]; selected: Aircraft | null; select: (a: Aircraft) => void; mode: '3D' | '2D'; camera: CameraTarget; trail: TrailPoint[]; replayIndex: number | null; geometry: GeometryFile | null; now: number; zoomSignal: number; onReady: () => void; onAirport: (id: AirportId) => void; onFacility: (f: FacilityTarget) => void; onInteract: () => void; following: boolean; command: MapCommand; route: FlightRoute | null; }
const BASE = import.meta.env.BASE_URL;
const planeSvg = (fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="${fill}" stroke="#0b1822" stroke-width="1.2" d="M16 2c1.3 0 2 2 2 4v7l11 7v3l-11-4v7l4 3v2l-6-2-6 2v-2l4-3v-7L3 23v-3l11-7V6c0-2 .7-4 2-4Z"/></svg>`)}`;
const targetSvg=(kind:string)=>`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="${kind==='vehicle'?4:0}" fill="#102430" stroke="#f7ce84" stroke-width="2"/><text x="16" y="22" text-anchor="middle" font-size="18" fill="#fff">${kind==='vehicle'?'V':kind==='fixed'?'F':'?'}</text></svg>`)}`;
const mintPlane = planeSvg('#8fdfc8'); const oldPlane = planeSvg('#c5a777'); const normalPlane = planeSvg('#d2dfe6');

const GroundAnimation=lazy(()=>import('./GroundAnimation').then(m=>({default:m.GroundAnimation})));
export function Globe(p: Props) {
  const [towerTarget,setTowerTarget]=useState('');
  const detailAirports=useMemo(()=>[...new Map([...(p.geometry?.airports??[]),...(p.arrivalGeometry?[p.arrivalGeometry]:[])].map(a=>[a.id,a])).values()],[p.geometry,p.arrivalGeometry]);
  const modelAttempts=useRef(new Map<string,ModelAttempt>()),watchedModels=useRef(new WeakSet<object>());const [modelRevision,setModelRevision]=useState(0);
  const retryModel=()=>{const a=callbacks.current.selected;if(!a)return;const id=`aircraft-${a.hex}`,old=modelAttempts.current.get(id);if(old){modelAttempts.current.set(id,{...old,stage:'primary',ready:false,since:Date.now(),retry:old.retry+1});readyModels.current.delete(id);rendered.current.delete(id);const e=viewer.current?.entities.getById(id);if(e)e.model=undefined;setModelRevision(n=>n+1);}};
  const readyModels=useRef(new Set<string>());const [selectedModelReady,setSelectedModelReady]=useState(false);
  const previousCommand=useRef(p.command.serial);
  const [contextLost,setContextLost]=useState(false);const lostRef=useRef(false),firstRecovery=useRef(p.recoveryPose);
  const animatedIds=useRef(new Set<string>());
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Cesium.Viewer | null>(null);
  const positions = useRef(new Map<string, Aircraft>());
  const callbacks = useRef(p); callbacks.current = p;
  const facilities = useRef(new Map<string, FacilityTarget>());
  const selectRef = useRef(p.select); selectRef.current = p.select;
  const [flightOpen,setFlightOpen]=useState(false);const flightOpenRef=useRef(false);flightOpenRef.current=flightOpen;
  const [modelCameraRevision,setModelCameraRevision]=useState(0);
  useEffect(()=>{
    if(!p.selected||p.obscured)return;
    const warmer=createModelWarmup(new URL(BASE,location.href).href);
    const warm=()=>{const state=callbacks.current,a=state.selected;if(!a||!hasPosition(a)||document.hidden)return;
      warmer.add(fleetUri(a),true);if(!flightOpen)return;
      state.aircraft.filter(b=>b.hex!==a.hex&&b.targetKind==='aircraft'&&hasPosition(b)).map(b=>({b,d:Math.hypot((b.lon!-a.lon!)*Math.cos(a.lat!*Math.PI/180),b.lat!-a.lat!)})).filter(x=>x.d<.25).sort((a,b)=>a.d-b.d).slice(0,state.preferences.quality==='low'?1:3).forEach(({b})=>warmer.add(fleetUri(b)));
    };warm();const timer=setInterval(warm,10000);return()=>{clearInterval(timer);warmer.dispose();};
  },[flightOpen,p.obscured,p.selected?.hex]);

  const cameraMoving=useRef(false);


  const [cities,setCities]=useState<City[]>([]);
  useEffect(()=>{const abort=new AbortController();fetch(`${BASE}data/cities.json`,{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Cities unavailable');return r.json();}).then(data=>setCities(data.cities)).catch(()=>{});return()=>abort.abort();},[]);
  const [ready, setReady] = useState(false);
  useEffect(()=>{const v=viewer.current;if(!ready||!v)return;return installRenderDiagnostics(v);},[ready]); const [error, setError] = useState('');
  useEffect(()=>{const v=viewer.current;if(!ready||!v)return;const initial=callbacks.current;
    return installArrivalSpin(window.Cesium,v,initial.camera.type==='world'&&(initial.camera.spin===true||(initial.camera.serial===0&&!initial.recoveryPose))&&!initial.preferences.reducedMotion,()=>{const p=callbacks.current;return {stop:p.preferences.reducedMotion||p.mode!=='3D'||p.camera.serial!==initial.camera.serial||p.command.serial!==initial.command.serial||p.zoomSignal!==initial.zoomSignal||!!p.selected||!!p.playback||p.following,paused:p.obscured};});
  },[ready,p.camera.serial]);

  useEffect(()=>{const v=viewer.current;if(!v||!ready)return;let timer:ReturnType<typeof setTimeout>|undefined;const changed=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;setModelCameraRevision(n=>n+1);},250);};const remove=v.camera.changed.addEventListener(changed);return()=>{remove();clearTimeout(timer);};},[ready]);
  const [hover,setHover]=useState<{aircraft:Aircraft;x:number;y:number}|null>(null);
  const [tilesLoading,setTilesLoading]=useState(false);
  const [terrainError,setTerrainError]=useState(false);
  const [terrainAttempt,retryTerrain]=useState(0);
  const terrainActive=p.preferences.terrain&&p.mode==='3D';
  const [mapError, setMapError] = useState(''),[mapAttempt,setMapAttempt]=useState(0);
  const [imageryError, setImageryError] = useState('');
  const [imageryReady, setImageryReady] = useState(false);
  const [imageryAttempt, retryImagery] = useState(0);
  const [readout, setReadout] = useState({heading:0, scale:'', width:0});
  const atlas = useRef<Cesium.GroundPrimitive | null>(null);
  const grid = useRef<Cesium.Entity[]>([]);
  const atlasLabels = useRef<Cesium.Entity[]>([]);
  const rendered = useRef(new Map<string,string>());
  useEffect(()=>{
    const v=viewer.current;if(!ready||!v||v.isDestroyed()||(!p.geometry&&!p.arrivalGeometry))return;
    return retainMapCredit(window.Cesium,v,osmCredit);
  },[ready,p.geometry,p.arrivalGeometry]);

  useEffect(()=>{const v=viewer.current;if(!ready||!v)return;let timer:ReturnType<typeof setTimeout>;
    const start=v.camera.moveStart.addEventListener(()=>{clearTimeout(timer);cameraMoving.current=true;});
    const end=v.camera.moveEnd.addEventListener(()=>{clearTimeout(timer);timer=setTimeout(()=>{cameraMoving.current=false;setModelCameraRevision(n=>n+1);},350);});
    return()=>{clearTimeout(timer);start();end();cameraMoving.current=false;};
  },[ready]);
  const satellite = p.preferences.basemap === 'satellite' && imageryReady;

  const readyCallback = useRef(p.onReady); readyCallback.current = p.onReady;
  useEffect(() => {
    if (!container.current) return;
    const C = window.Cesium;
    if (!C) { setError('The globe engine could not load. Reload to retry.'); readyCallback.current(); return; }
    let alive = true;
    let v: Cesium.Viewer; let cleanupInput = () => {};
    try {
      v = new C.Viewer(container.current, { creditContainer: 'map-attribution', creditViewport: document.body, baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(), animation: false, timeline: false, geocoder: false, baseLayerPicker: false, sceneModePicker: false, homeButton: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity, msaaSamples: 1, contextOptions: { webgl: { alpha: false, antialias: true } } });
      viewer.current = v;
      v.scene.backgroundColor = C.Color.fromCssColorString('#07121b');
      v.resolutionScale = Math.min(devicePixelRatio, 1.5);
      v.scene.globe.maximumScreenSpaceError = 1.5;
      // Retain nearby detail and load adjacent tiles before the following camera reaches them.
      v.scene.globe.preloadSiblings = true;
      v.scene.globe.preloadAncestors = true;
      v.scene.globe.tileCacheSize = callbacks.current.preferences.quality==='low'?160:320;
      v.scene.postProcessStages.fxaa.enabled = true;
      if(v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;
      v.scene.globe.baseColor = C.Color.fromCssColorString('#10283b');
      v.scene.globe.showGroundAtmosphere = true;
      v.scene.globe.enableLighting = true;
      v.scene.globe.depthTestAgainstTerrain = false;
      const controller = v.scene.screenSpaceCameraController;
      controller.enableRotate = true; controller.enableTranslate = true; controller.enableZoom = true; controller.enableTilt = true;
      controller.rotateEventTypes = C.CameraEventType.LEFT_DRAG;
      controller.translateEventTypes = C.CameraEventType.LEFT_DRAG;
      controller.zoomEventTypes = [C.CameraEventType.WHEEL, C.CameraEventType.PINCH];
      controller.tiltEventTypes = [C.CameraEventType.RIGHT_DRAG, C.CameraEventType.MIDDLE_DRAG, {eventType: C.CameraEventType.LEFT_DRAG, modifier: C.KeyboardEventModifier.CTRL}, C.CameraEventType.PINCH];
      // A pinch changes distance only; use the explicit tilt control on touch screens.
      controller.tiltEventTypes = [C.CameraEventType.RIGHT_DRAG, C.CameraEventType.MIDDLE_DRAG, {eventType:C.CameraEventType.LEFT_DRAG,modifier:C.KeyboardEventModifier.CTRL}];
      controller.inertiaSpin = .65; controller.inertiaZoom = .55; controller.inertiaTranslate=.65;
      controller.maximumMovementRatio=.06;
      controller.minimumZoomDistance = 50;
      v.scene.screenSpaceCameraController.maximumZoomDistance = 35000000;
      v.scene.screenSpaceCameraController.enableCollisionDetection = true;
      v.camera.setView({ destination: C.Cartesian3.fromDegrees(-25, 27, 12000000) });
      // Keep public-domain source details in the native, keyboard-accessible credit dialog.
      v.creditDisplay.addStaticCredit(new C.Credit('<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Geography and city labels: Natural Earth · public domain</a>', false));
      v.creditDisplay.addStaticCredit(new C.Credit('<a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">Airport directory and runways: OurAirports · public domain</a>', false));
      const creditsLink=v.cesiumWidget.creditContainer.querySelector('.cesium-credit-expand-link');
      if(creditsLink)creditsLink.textContent='Map credits';
      const color = C.Color.fromCssColorString('#3a627c').withAlpha(.32);
      for (let lon = -180; lon < 180; lon += 30) {
        const coords: number[] = []; for (let lat = -85; lat <= 85; lat += 5) coords.push(lon, lat);
        grid.current.push(v.entities.add({ show: callbacks.current.preferences.grid, polyline: { positions: C.Cartesian3.fromDegreesArray(coords), width: 1, material: color, distanceDisplayCondition: new C.DistanceDisplayCondition(500000,40000000) } }));
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const coords: number[] = []; for (let lon = -180; lon <= 180; lon += 5) coords.push(lon, lat);
        grid.current.push(v.entities.add({ show: callbacks.current.preferences.grid, polyline: { positions: C.Cartesian3.fromDegreesArray(coords), width: 1, material: color, distanceDisplayCondition: new C.DistanceDisplayCondition(500000,40000000) } }));
      }
      for (const [code, airport] of Object.entries(AIRPORTS)) {
        v.entities.add({ id: `airport-${code}`, position: C.Cartesian3.fromDegrees(airport.lon, airport.lat, 5), point: { distanceDisplayCondition:new C.DistanceDisplayCondition(0,12000000), pixelSize: 5, color: C.Color.fromCssColorString('#8fdfc8'), outlineWidth: 4, outlineColor: C.Color.fromCssColorString('#8fdfc8').withAlpha(.14) }, label: { distanceDisplayCondition:new C.DistanceDisplayCondition(0,600000), text: code, font: '600 13px sans-serif', fillColor: C.Color.WHITE, pixelOffset: new C.Cartesian2(15, 0), horizontalOrigin: C.HorizontalOrigin.LEFT, style: C.LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, outlineColor: C.Color.fromCssColorString('#10202d') } });
      }
      for (const [name, lon, lat] of [['N O R T H  A M E R I C A', -102, 40], ['E U R O P E', 13, 51], ['A F R I C A', 12, 9], ['N O R T H  A T L A N T I C', -35, 23]] as [string, number, number][]) {
        atlasLabels.current.push(v.entities.add({ position: C.Cartesian3.fromDegrees(lon, lat, 3000), label: { text: name, font: '10px sans-serif', fillColor: C.Color.fromCssColorString('#82a3b9'), distanceDisplayCondition: new C.DistanceDisplayCondition(1000000, 40000000), translucencyByDistance: new C.NearFarScalar(5000000, .85, 22000000, .4) } }));
      }
      // Selection and camera following are separate. Never let Cesium's default
      // double-click tracking lock the globe without an explicit Follow action.
      v.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      v.screenSpaceEventHandler.setInputAction((event: {position: Cesium.Cartesian2}) => {
        if(callbacks.current.playback)return;
        const picks = v.scene.drillPick(event.position, 12);
        const ids = picks.map(pick => typeof pick?.id === 'string' ? pick.id : pick?.id?.id).filter((id): id is string => typeof id === 'string');
        // At globe scale aircraft collapse onto airport markers. Keep the airport
        // clickable there; individual aircraft remain selectable from the list.
        const id = (v.camera.positionCartographic.height > 200000 ? ids.find(id => id.startsWith('airport-')) : undefined) ?? ids[0];
        if (typeof id !== 'string') return;
        if (positions.current.has(id)) selectRef.current(positions.current.get(id)!);
        else if (id.startsWith('airport-') && Object.hasOwn(AIRPORTS,id.slice(8))) callbacks.current.onAirport(id.slice(8) as AirportId);
        else if(id.startsWith('movement-')){const a=positions.current.get(`aircraft-${id.slice(9)}`);if(a)selectRef.current(a);}
        else if (facilities.current.has(id)) callbacks.current.onFacility(facilities.current.get(id)!);
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      let lastHover=0;
      v.screenSpaceEventHandler.setInputAction((event:{endPosition:Cesium.Cartesian2})=>{
        const time=performance.now();if(time-lastHover<100)return;lastHover=time;
        const pick=v.scene.pick(event.endPosition),id=pick?.id?.id;
        const a=positions.current.get(id);
        setHover(a?{aircraft:a,x:Math.min(event.endPosition.x+14,v.canvas.clientWidth-210),y:Math.max(10,event.endPosition.y-85)}:null);
      },C.ScreenSpaceEventType.MOUSE_MOVE);
      const leave=()=>setHover(null);v.canvas.addEventListener('pointerleave',leave);
      const release = () => { setHover(null); v.camera.cancelFlight(); v.trackedEntity = undefined; v.camera.lookAtTransform(C.Matrix4.IDENTITY); callbacks.current.onInteract(); v.scene.requestRender(); };
      const keyboard = (event: KeyboardEvent) => {
        const actions: Record<string, MapCommand['action']> = {ArrowLeft:'left',ArrowRight:'right',n:'north',t:'tilt'};
        if (!actions[event.key] && !['+','-','='].includes(event.key)) return;
        event.preventDefault(); release();
        if (actions[event.key]) moveCamera(v, actions[event.key]);
        else if (event.key === '-') v.camera.zoomOut(Math.max(100,v.camera.positionCartographic.height*.4));
        else v.camera.zoomIn(Math.max(100,v.camera.positionCartographic.height*.3));
        v.scene.requestRender();
      };
      v.canvas.tabIndex = 0; v.canvas.setAttribute('aria-label','Interactive globe. Drag to spin, scroll to zoom, right-drag to tilt. Arrow keys rotate; N resets north.');
      v.canvas.addEventListener('pointerdown', release); v.canvas.addEventListener('wheel', release, {passive:true}); v.canvas.addEventListener('keydown', keyboard);
      cleanupInput = () => {v.canvas.removeEventListener('pointerleave',leave);v.canvas.removeEventListener('pointerdown',release);v.canvas.removeEventListener('wheel',release);v.canvas.removeEventListener('keydown',keyboard);};
      const updateReadout = () => {
        const h = Math.round(C.Math.toDegrees(v.camera.heading)) % 360;
        const y = Math.max(0,v.canvas.clientHeight - 55), x = v.canvas.clientWidth / 2;
        const a = v.camera.pickEllipsoid(new C.Cartesian2(x,y), v.scene.globe.ellipsoid);
        const b = v.camera.pickEllipsoid(new C.Cartesian2(x+100,y), v.scene.globe.ellipsoid);
        if(!a || !b){setReadout({heading:h,scale:'',width:0});return;}
        const distance = new C.EllipsoidGeodesic(C.Cartographic.fromCartesian(a),C.Cartographic.fromCartesian(b)).surfaceDistance;
        if(!Number.isFinite(distance)||distance<=0)return;
        const base = 10**Math.floor(Math.log10(distance));
        const meters = [5,2,1].map(n=>n*base).find(n=>n<=distance) ?? base;
        setReadout({heading:h,scale:meters>=1000?`${meters/1000} km`:`${meters} m`,width:100*meters/distance});
      };
      v.camera.percentageChanged = .02;
      const removeChanged = v.camera.changed.addEventListener(updateReadout);
      const removeEnd = v.camera.moveEnd.addEventListener(updateReadout);
      const resize = new ResizeObserver(()=>{v.resize();updateReadout();}); resize.observe(container.current);
      const removeTiles=v.scene.globe.tileLoadProgressEvent.addEventListener((count:number)=>setTilesLoading(count>0));
      const previousCleanup = cleanupInput;
      cleanupInput=()=>{previousCleanup();removeTiles();removeChanged();removeEnd();resize.disconnect();};
      updateReadout();
      let recoveryTimer:ReturnType<typeof setTimeout>|undefined;
      const pose=():RecoveryPose=>{const pos=v.camera.positionCartographic;return {lon:C.Math.toDegrees(pos.longitude),lat:C.Math.toDegrees(pos.latitude),height:pos.height,heading:v.camera.heading,pitch:v.camera.pitch,roll:v.camera.roll};};
      const rebuild=()=>{if(!alive)return;if(!callbacks.current.recover(pose()))setError('Automatic graphics recovery paused after repeated failures. Retry the globe; observations and unsaved sessions remain in memory.');};
      const lost=(event:Event)=>{event.preventDefault();if(lostRef.current)return;lostRef.current=true;setContextLost(true);v.useDefaultRenderLoop=false;setError('Graphics connection lost. Rebuilding the globe; observations and recordings are retained…');clearTimeout(recoveryTimer);recoveryTimer=setTimeout(rebuild,1500);};
      const restored=()=>{clearTimeout(recoveryTimer);rebuild();};
      // Context loss can precede delivery of the DOM event by a frame. Do not let
      // Cesium compute billboard bounds with a lost/zero-sized drawing buffer.
      const widget=v.cesiumWidget,originalRender=widget.render;
      const gl=v.canvas.getContext('webgl2')??v.canvas.getContext('webgl');
      widget.render=()=>{if(gl?.isContextLost()){lost(new Event('webglcontextlost',{cancelable:true}));return;}if(gl&&(!gl.drawingBufferWidth||!gl.drawingBufferHeight))return;originalRender.call(widget);};
      v.canvas.addEventListener('webglcontextlost',lost);v.canvas.addEventListener('webglcontextrestored',restored);
      const renderError=v.scene.renderError.addEventListener(()=>{renderFailure();if(alive){setError('The globe stopped rendering. Rebuilding graphics; the aircraft list remains available.');clearTimeout(recoveryTimer);recoveryTimer=setTimeout(rebuild,1500);}});
      const graphicsCleanup=cleanupInput;cleanupInput=()=>{graphicsCleanup();widget.render=originalRender;clearTimeout(recoveryTimer);renderError();v.canvas.removeEventListener('webglcontextlost',lost);v.canvas.removeEventListener('webglcontextrestored',restored);};
      const syncAtlas=()=>{if(atlas.current)atlas.current.show=!hasBaseImagery(v);v.scene.requestRender();};
      const removeAdded=v.imageryLayers.layerAdded.addEventListener(syncAtlas),removeRemoved=v.imageryLayers.layerRemoved.addEventListener(syncAtlas);const earlierCleanup=cleanupInput;cleanupInput=()=>{earlierCleanup();removeAdded();removeRemoved();};
      if(!performance.getEntriesByName('skyward-map-ready').length)performance.mark('skyward-map-ready');callbacks.current.onViewer(v);setReady(true); readyCallback.current();
    } catch { setError('WebGL is unavailable. Try a browser with hardware acceleration. The aircraft list still works.'); readyCallback.current(); }
    return () => { callbacks.current.onViewer(null);alive = false; cleanupInput(); if (v && !v.isDestroyed()) v.destroy(); viewer.current = null; };
  }, []);
  useEffect(()=>{
    const v=viewer.current;if(!ready||!v||v.isDestroyed())return;
    const C=window.Cesium,abort=new AbortController();let alive=true,primitive:Cesium.GroundPrimitive|undefined;
    setMapError('');
    void (async()=>{
      const json=await loadGeography(`${BASE}data/world.geojson`,abort.signal);
      if(!alive||v.isDestroyed())return;
      const data=await C.GeoJsonDataSource.load(json,{clampToGround:true});
      await C.GroundPrimitive.initializeTerrainHeights();
      if(!alive||v.isDestroyed())return;
      const instances=data.entities.values.filter(e=>e.polygon).map(e=>new C.GeometryInstance({geometry:new C.PolygonGeometry({polygonHierarchy:e.polygon!.hierarchy!.getValue(v.clock.currentTime),vertexFormat:C.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT}),attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString('#294555'))}}));
      primitive=v.scene.groundPrimitives.add(new C.GroundPrimitive({geometryInstances:instances,asynchronous:false}));atlas.current=primitive!;primitive!.show=!hasBaseImagery(v);v.scene.requestRender();
    })().catch(()=>{if(alive&&!v.isDestroyed())setMapError('Country outlines unavailable. Check connection health for live traffic.');});
    return()=>{alive=false;abort.abort();if(primitive&&!v.isDestroyed())v.scene.groundPrimitives.remove(primitive);if(atlas.current===primitive)atlas.current=null;};
  },[ready,mapAttempt]);
  useEffect(()=>{const v=viewer.current;if(!v||!ready)return;const update=()=>{if(v.isDestroyed())return;v.useDefaultRenderLoop=!p.obscured&&!document.hidden&&!contextLost;if(v.useDefaultRenderLoop){v.resize();v.scene.requestRender();}};update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[ready,p.obscured,contextLost]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;const C=window.Cesium;let last='';
    const publish=()=>{
      if(v.isDestroyed()||document.hidden)return;
      // Suppress global arrival-spin requests, but keep local traffic updating
      // even during a long pan or when Cesium misses a moveEnd event.
      if(cameraMoving.current&&!callbacks.current.following&&v.camera.positionCartographic.height>800000)return;
      const canvas=v.canvas,points:{lat:number;lon:number}[]=[];let center:{lat:number;lon:number}|null=null;
      for(const [x,y] of [[.5,.5],[.04,.04],[.96,.04],[.96,.96],[.04,.96],[.5,.04],[.96,.5],[.5,.96],[.04,.5]]){
        const p=v.camera.pickEllipsoid(new C.Cartesian2(canvas.clientWidth*x,canvas.clientHeight*y),v.scene.globe.ellipsoid);if(!p)continue;
        const c=C.Cartographic.fromCartesian(p),pt={lat:C.Math.toDegrees(c.latitude),lon:C.Math.toDegrees(c.longitude)};points.push(pt);if(x===.5&&y===.5)center=pt;
      }
      if(!center&&points.length)center=points[0];
      // A low camera looking along/above the horizon may have no Earth picks.
      // Use its actual position, never the selected airport's geometry.
      const position=v.camera.positionCartographic;
      if((!center&&position.height<800000)||callbacks.current.camera.type==='tower')center={lat:C.Math.toDegrees(position.latitude),lon:C.Math.toDegrees(position.longitude)};
      const a=center?cameraArea(center,points,points.length<9||position.height>800000):null;
      const key=areaKey(a)+String(a?.limited);if(key!==last){last=key;callbacks.current.onTrafficArea(a);}
    };
    let settled:ReturnType<typeof setTimeout>;
    const schedule=()=>{clearTimeout(settled);settled=setTimeout(publish,450);};
    const remove=v.camera.moveEnd.addEventListener(schedule),changed=v.camera.changed.addEventListener(schedule);
    const timer=setInterval(publish,3000),start=setTimeout(publish,750);
    return()=>{remove();changed();clearTimeout(settled);clearInterval(timer);clearTimeout(start);};
  },[ready,p.mode,p.camera.type]);
  useEffect(() => {
    const v=viewer.current; if(!ready || !v) return;
    const C=window.Cesium;
    let alive=true, layer: Cesium.ImageryLayer | undefined, base:Cesium.ImageryLayer|undefined, failures=0;
    let removeError = () => {};
    setImageryReady(false);setImageryError('');
    if(p.preferences.basemap !== 'satellite') return;
    base=v.imageryLayers.addImageryProvider(createGlobalBasemap(C,BASE),0);
    const fallback=()=>{
      if(!alive || v.isDestroyed())return;
      if(layer && v.imageryLayers.contains(layer))v.imageryLayers.remove(layer,true);
      layer=undefined;if(base&&v.imageryLayers.contains(base))v.imageryLayers.remove(base,true);base=undefined;setImageryReady(false);
      setImageryError('Satellite imagery unavailable. Showing the atlas.');
      if(atlas.current)atlas.current.show=!hasBaseImagery(v);
      v.scene.requestRender();
    };
    const timer = window.setTimeout(fallback,15000);
    void C.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {enablePickFeatures:false, maximumLevel:19}).then(provider=>{
      if(!alive || v.isDestroyed())return;
      clearTimeout(timer);
      // Keep provider metadata attribution visible at every zoom level.
      if(provider.credit)provider.credit.showOnScreen=true;
      removeError=provider.errorEvent.addEventListener(()=>{if(++failures>=4)fallback();});
      if(!base)base=v.imageryLayers.addImageryProvider(createGlobalBasemap(C,BASE),0);
      layer=v.imageryLayers.addImageryProvider(provider);
      setImageryError('');setImageryReady(true);v.scene.requestRender();
    }).catch(()=>{clearTimeout(timer);fallback();});
    return()=>{alive=false;clearTimeout(timer);removeError();if(!v.isDestroyed()){if(layer&&v.imageryLayers.contains(layer))v.imageryLayers.remove(layer,true);if(base&&v.imageryLayers.contains(base))v.imageryLayers.remove(base,true);}};
  },[ready,p.preferences.basemap,imageryAttempt]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;
    v.scene.globe.showGroundAtmosphere=satellite;
    if(atlas.current)atlas.current.show=!satellite&&!hasBaseImagery(v);
    grid.current.forEach(e=>{e.show=p.preferences.grid;});
    atlasLabels.current.forEach(e=>{e.show=false;});
    v.scene.requestRender();
  },[ready,satellite,p.preferences.grid,p.preferences.labels]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;const C=window.Cesium;
    for(const e of v.entities.values)if(e.id.startsWith('airport-')&&e.label)e.label.font=new C.ConstantProperty(p.preferences.largeLabels?'600 17px sans-serif':'600 13px sans-serif');
    if(p.preferences.reducedMotion)v.camera.cancelFlight();
    v.scene.requestRender();
  },[ready,p.preferences.largeLabels,p.preferences.reducedMotion]);
  useEffect(() => {
    const v = viewer.current; if (!ready || !v) return;
    const C = window.Cesium;
    const is2D = v.scene.mode === C.SceneMode.SCENE2D;
    if (p.mode === '2D' && !is2D) v.scene.morphTo2D(0);
    if (p.mode === '3D' && is2D) v.scene.morphTo3D(0);
    v.scene.requestRender();
  }, [p.mode, ready]);
  useEffect(()=>{setTerrainError(false);},[p.preferences.terrain]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;
    if(!terrainActive){v.terrainProvider=new window.Cesium.EllipsoidTerrainProvider();v.scene.requestRender();return;}
    const terrain=createOpenTerrain(()=>setTerrainError(true),()=>{if(!v.isDestroyed())v.scene.requestRender();});v.terrainProvider=terrain.provider;v.scene.requestRender();
    const warm=()=>{const state=callbacks.current;if(document.hidden||state.obscured||state.preferences.batterySaver)return;const a=state.selected,fix=a&&flightOpenRef.current?(sharedLiveMotion.displayed(a.hex)??a):null;if(fix&&fix.lon!=null&&fix.lat!=null){for(const point of sceneryAhead(fix.lon,fix.lat,fix.heading??null,fix.groundSpeed??null))terrain.warm(point.lon,point.lat);}const arrival=state.arrivalGeometry;if(arrival)terrain.warm(arrival.lon,arrival.lat);};warm();const timer=setInterval(warm,15000);
    return()=>{clearInterval(timer);terrain.dispose();};
  },[ready,terrainActive,terrainAttempt]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;
    const getState=()=>({aircraft:callbacks.current.camera.type==='tower'?callbacks.current.groundObservations:callbacks.current.aircraft,tower:callbacks.current.camera.type==='tower',selected:callbacks.current.selected,quality:callbacks.current.preferences.quality,reduced:callbacks.current.preferences.reducedMotion||callbacks.current.preferences.batterySaver});
    const lights=installAircraftLights(window.Cesium,v,getState),gear=installLandingGear(window.Cesium,v,getState);
    const touchdown=installTouchdownEffects(window.Cesium,v,()=>({id:flightOpenRef.current&&callbacks.current.selected?`aircraft-${callbacks.current.selected.hex}`:null,type:callbacks.current.selected?.aircraftType??'',audio:flightOpenRef.current&&readCabinAudio(),reduced:callbacks.current.preferences.reducedMotion}));
    return()=>{touchdown();lights();gear();};
  },[ready]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;const C=window.Cesium;
    const dispose=installSolarLighting(C,v);
    v.scene.requestRender();return dispose;
  },[ready]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;
    v.shadows=p.preferences.shadows&&p.preferences.quality==='high';v.shadowMap.maximumDistance=10000;v.shadowMap.size=p.preferences.quality==='high'?2048:1024;
    v.scene.msaaSamples=p.preferences.quality==='high'?4:1;v.scene.requestRender();
  },[ready,p.preferences.shadows,p.preferences.quality]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready||!p.preferences.autoQuality||p.preferences.quality==='low')return;
    let previous=0,frame=0;const samples:number[]=[];const start=performance.now();let reported=false;
    // Sample the browser animation clock, not intentional request-render idle intervals.
    const sample=(now:number)=>{if(document.hidden||now-start<6000){previous=0;samples.length=0;}else{const gap=previous?now-previous:0;previous=now;if(gap<=0||gap>=1000)samples.length=0;else{samples.push(gap);if(samples.length>90)samples.shift();const next=suggestedQuality(p.preferences.quality,samples);if(next&&!reported){reported=true;callbacks.current.onAutomaticQuality(next);}}}if(!reported)frame=requestAnimationFrame(sample);};
    frame=requestAnimationFrame(sample);return()=>cancelAnimationFrame(frame);
  },[ready,p.preferences.autoQuality,p.preferences.quality]);
  useEffect(() => {
    const v = viewer.current; if (!ready || !v || (!p.geometry&&!p.arrivalGeometry)) return;
    const C = window.Cesium; const added: Cesium.Entity[] = [];
    const meshes: Cesium.GeometryInstance[] = [], lines: Cesium.GeometryInstance[] = [];
    const colorAttribute = (hex: string) => ({ color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(hex)) });
    facilities.current.clear();
    const airports=[...new Map([...(p.geometry?.airports??[]),...(p.arrivalGeometry?[p.arrivalGeometry]:[])].map(a=>[a.id,a])).values()];
    for (const airport of airports) {
      const allFacilities = airportFacilities(airport);
      allFacilities.forEach((f,i)=>facilities.current.set(`facility-${airport.id}-${i}`,f));
      if(terrainActive){added.push(...addTerrainAirport(v,airport,allFacilities,(p.camera.type==='tower'||flightOpen)?{...p.preferences,structures:true}:p.preferences));continue;}
      let buildingIndex = airport.runways.length;
      for (const surface of airport.surfaces) {
        const coords = surface.points.flat();
        if (coords.length < 6) continue;
        if(surface.kind === 'apron' && satellite)continue;
        meshes.push(new C.GeometryInstance({ id: surface.kind === 'apron' ? `airport-${airport.id}` : `facility-${airport.id}-${buildingIndex++}`, geometry: new C.PolygonGeometry({ polygonHierarchy: airportPolygonHierarchy(C,surface), height: surface.kind === 'apron' ? .3 : 1, extrudedHeight: airportBuildingHeight(surface), vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT }), attributes: colorAttribute(surface.kind === 'apron' ? '#243d49' : surface.kind === 'terminal' ? (satellite ? '#b4b7b1' : '#799da5') : (satellite ? '#8d9699' : '#455e6b')) }));
      }
      for (const path of airport.paths) if (path.points.length >= 2) lines.push(new C.GeometryInstance({ geometry: new C.PolylineGeometry({ positions: C.Cartesian3.fromDegreesArrayHeights(path.points.flatMap(pt => [...pt, 1])), width: satellite ? 1 : path.kind === 'parking_position' ? 1 : 3, vertexFormat: C.PolylineColorAppearance.VERTEX_FORMAT }), attributes: colorAttribute(path.kind === 'parking_position' ? '#aa9b62' : '#607478') }));
      for (const [runwayIndex, r] of airport.runways.entries()) {
        if(!satellite)meshes.push(new C.GeometryInstance({ id: `facility-${airport.id}-${runwayIndex}`, geometry: new C.CorridorGeometry({ positions: C.Cartesian3.fromDegreesArray([...r.a, ...r.b]), width: r.width, height: 1, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT }), attributes: colorAttribute('#7e8f94') }));
        added.push(v.entities.add({ id:`facility-${airport.id}-${runwayIndex}`, polyline: { positions: C.Cartesian3.fromDegreesArrayHeights([...r.a, 2, ...r.b, 2]), width: 2, material: new C.PolylineDashMaterialProperty({ color: C.Color.fromCssColorString('#ecf2eb'), dashLength: 12 }), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 100000) } }));
        const ends = r.id.split('/');
        [r.a, r.b].forEach((point, i) => added.push(v.entities.add({ position: C.Cartesian3.fromDegrees(...point, 5), label: { text: ends[i] ?? r.id, font: p.preferences.largeLabels?'600 16px sans-serif':'600 12px sans-serif', fillColor: C.Color.fromCssColorString('#dce8ed'), showBackground: true, backgroundColor: C.Color.fromCssColorString('#0e1e29').withAlpha(.85), pixelOffset: new C.Cartesian2(0, -14), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 100000) } })));
      }
      for (const [gateIndex,g] of airport.gates.entries()) added.push(v.entities.add({ id: `facility-${airport.id}-${buildingIndex+gateIndex}`, position: C.Cartesian3.fromDegrees(...g.position, 6), point: {pixelSize:4,color:C.Color.fromCssColorString('#8fdfc8'),disableDepthTestDistance:Number.POSITIVE_INFINITY,distanceDisplayCondition:new C.DistanceDisplayCondition(0,12000)}, label: { text: g.label, font: p.preferences.largeLabels?'15px sans-serif':'11px sans-serif', disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new C.Cartesian2(0,-12), style:C.LabelStyle.FILL_AND_OUTLINE, outlineColor:C.Color.fromCssColorString('#09141c'),outlineWidth:3, fillColor: C.Color.fromCssColorString('#afc6d0'), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 3000) } }));
    }
    // This small, fixed airport snapshot is built synchronously so airport details
    // do not wait behind worldwide polygon jobs in Cesium's shared worker pool.
    const surfaces = v.scene.primitives.add(new C.Primitive({ show:p.preferences.structures||p.camera.type==='tower'||flightOpen, geometryInstances: meshes, appearance: buildingAppearance(C,airports[0]?.lon??0,airports[0]?.lat??0), asynchronous: false }));
    const taxiways = v.scene.primitives.add(new C.Primitive({ show:p.preferences.structures||p.camera.type==='tower'||flightOpen, geometryInstances: lines, appearance: new C.PolylineColorAppearance({ translucent: false }), asynchronous: false }));
    if(!terrainActive)added.forEach(e=>{e.show=p.preferences.labels;});
    v.scene.requestRender(); return () => { if (!v.isDestroyed()) { for (const e of added) v.entities.remove(e); v.scene.primitives.remove(surfaces); v.scene.primitives.remove(taxiways); } };
  }, [p.geometry,p.arrivalGeometry, ready, satellite, p.preferences.structures, p.preferences.labels,p.preferences.largeLabels,terrainActive,p.camera.type,flightOpen]);
  useEffect(() => {
    const v = viewer.current; if (!v || !ready) return;
    const C = window.Cesium;
    if(p.obscured)return;
    const tower=p.camera.type==='tower';
    const rows = new Map((p.camera.type==='tower'?p.groundObservations:p.aircraft).map(a => [a.hex, a])); if (p.selected) rows.set(p.selected.hex, p.selected);
    const ids = new Set<string>();
    // Visibility must follow the displayed position, not the newer network fix.
    const visualPosition=(a:Aircraft)=>v.entities.getById(`aircraft-${a.hex}`)?.position?.getValue(v.clock.currentTime)??C.Cartesian3.fromDegrees(a.lon!,a.lat!,Math.max(0,a.altitude??0)*.3048);
    const nearbyModels=new Set(nearbyModelIds([...rows.values()].filter(a=>a.hex!==p.selected?.hex&&a.targetKind==='aircraft'&&hasPosition(a)).map(a=>{const pos=visualPosition(a),screen=C.SceneTransforms.worldToWindowCoordinates(v.scene,pos),loaded=!!v.entities.getById(`aircraft-${a.hex}`)?.model;return {id:a.hex,pixels:40/Math.max(.001,v.camera.getPixelSize(new C.BoundingSphere(pos,20),v.canvas.width,v.canvas.height)),distance:C.Cartesian3.distance(v.camera.positionWC,pos),loaded,visible:!!screen&&screen.x>=-100&&screen.y>=-100&&screen.x<v.canvas.clientWidth+100&&screen.y<v.canvas.clientHeight+100&&(tower||!cameraMoving.current||loaded)};}),(p.preferences.autoQuality&&readRenderStats(v).backgroundLimited?Math.min(1,modelBudget(p.preferences.quality,tower)):modelBudget(p.preferences.quality,tower)),tower));

    for (const a of rows.values()) {
      if (!hasPosition(a)) continue;
      const id = `aircraft-${a.hex}`; ids.add(id); positions.current.set(id, a);
      const selected = p.selected?.hex === a.hex,protectedModel=selected||(tower&&a.hex===towerTarget); const replay = selected && p.replayIndex !== null ? p.trail[p.replayIndex] : null;
      const lon = replay?.lon ?? a.lon!; const lat = replay?.lat ?? a.lat!; const alt = (replay?.ground??a.ground)?surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(lon,lat))):Math.max(0, replay?.altitude ?? a.altitude ?? 0) * .3048;
      const distance=C.Cartesian3.distance(v.camera.positionWC,replay?C.Cartesian3.fromDegrees(lon,lat,alt):visualPosition(a));
      const freshness=aircraftFreshness(a,p.histories.get(a.hex)??[],p.now,p.preferences.reducedMotion);const stale = !a.simulation && ageSeconds(a, p.now) > 30;const modelled=p.mode==='3D'&&(protectedModel?(flightOpen||distance<modelRange(true,tower)):nearbyModels.has(a.hex));const distant=p.preferences.quality==='high'?1000000:600000;
      const signature = JSON.stringify([lon,lat,alt,tower,protectedModel,freshness.state,selected,modelled,p.preferences.quality,p.preferences.reducedMotion,flightOpen,stale,a.heading,a.callsign,a.registration,a.aircraftType,a.targetKind,a.ground,replay?.ground,p.mode,p.preferences.labels,p.preferences.largeLabels,p.preferences.quality,p.preferences.reducedMotion,terrainActive]);
      const existing=v.entities.getById(id);if(existing)existing.show=!p.playback;
      if(rendered.current.get(id)===signature)continue;
      rendered.current.set(id,signature);
      const position = C.Cartesian3.fromDegrees(lon, lat, alt + 8);
      let e = v.entities.getById(id);
      if (!e) e = v.entities.add({ id });
      e.show=!p.playback;
      const animationOwnsPosition=!!e.position&&!replay&&!p.preferences.reducedMotion&&(animatedIds.current.has(id)||(selected&&flightOpen));
      if(!animationOwnsPosition)e.position = new C.ConstantPositionProperty(position);
      if(!animationOwnsPosition)e.orientation = new C.ConstantProperty(C.Transforms.headingPitchRollQuaternion(position, new C.HeadingPitchRoll(C.Math.toRadians((a.heading ?? 0) - 90), 0, 0)));
      e.billboard??=new C.BillboardGraphics();updateGraphics(e.billboard,{ heightReference:C.HeightReference.NONE, image: a.targetKind==='vehicle'?targetSvg('vehicle'):a.targetKind==='fixed'?targetSvg('fixed'):a.targetKind==='unknown'?targetSvg('unknown'):a.simulation?normalPlane:selected ? mintPlane : stale ? oldPlane : normalPlane, width: selected ? 29 : 20, height: selected ? 29 : 20, rotation: a.targetKind&&a.targetKind!=='aircraft'?0:-C.Math.toRadians(a.heading ?? 0), color: C.Color.fromCssColorString(freshness.color).withAlpha(freshness.state==='stale'?.65:1), translucencyByDistance:modelled&&readyModels.current.has(id)?new C.NearFarScalar(modelRange(selected,tower)*.7,0,modelRange(selected,tower),1):undefined, distanceDisplayCondition: new C.DistanceDisplayCondition(modelled&&readyModels.current.has(id)&&a.targetKind==='aircraft' ? modelRange(selected,tower)*.7 : 0, selected?40000000:distant), disableDepthTestDistance: 0 });
      if(!selected){e.point??=new C.PointGraphics();updateGraphics(e.point,{pixelSize:4,color:C.Color.fromCssColorString(freshness.color),distanceDisplayCondition:new C.DistanceDisplayCondition(distant,40000000)});}else if(e.point)e.point=undefined;
      e.label??=new C.LabelGraphics();updateGraphics(e.label,{ heightReference:C.HeightReference.NONE, show: !(selected && flightOpen) && (selected || p.preferences.labels), text: a.callsign||a.registration||a.hex.toUpperCase(), font: `${selected ? '600' : '400'} ${p.preferences.largeLabels?16:12}px sans-serif`, fillColor: C.Color.fromCssColorString(freshness.color), pixelOffset: new C.Cartesian2(0, -23), showBackground: selected, backgroundColor: C.Color.fromCssColorString('#0b1b27').withAlpha(.85), distanceDisplayCondition: new C.DistanceDisplayCondition(0, selected ? 40000000 : 80000), style: C.LabelStyle.FILL_AND_OUTLINE, outlineColor: C.Color.fromCssColorString('#09141c'), outlineWidth: 3 });
      const source=`${BASE}${(selected||tower)?fleetUri(a):fallbackFleetUri(a)}`,fallback=`${BASE}${fallbackFleetUri(a)}`;
      let attempt=modelAttempts.current.get(id);if(!attempt||attempt.source!==source){attempt={source,fallback,stage:'primary',since:Date.now(),retry:0,ready:false};modelAttempts.current.set(id,attempt);}
      const showModel=modelled&&a.targetKind==='aircraft'&&attempt.stage!=='marker',detailed=(selected||tower)&&!!sourcedModel(a.aircraftType)&&attempt.stage==='primary';
      const uri=modelUri(attempt);
      if(showModel){
        // Preserve ModelGraphics between fixes so moving traffic does not recreate GPU models.
        if(!e.model){attempt.since=Date.now();attempt.ready=false;}
        if(!e.model)e.model=new C.ModelGraphics({minimumPixelSize:protectedModel?18:tower?12:0,maximumScale:protectedModel?3:tower?2:1,scale:1,shadows:C.ShadowMode.ENABLED});
        if(e.model.uri?.getValue(v.clock.currentTime)!==uri){e.model.uri=new C.ConstantProperty(uri);e.model.nodeTransformations=new C.PropertyBag();}
        updateGraphics(e.model,{minimumPixelSize:protectedModel?18:tower?12:0,maximumScale:protectedModel?3:tower?2:1,heightReference:C.HeightReference.NONE,distanceDisplayCondition:new C.DistanceDisplayCondition(0,modelRange(selected,tower))});
        e.model.color=new C.CallbackProperty(()=>{const pos=e!.position?.getValue(v.clock.currentTime);return C.Color.WHITE.withAlpha(pos?modelOpacity(C.Cartesian3.distance(v.camera.positionWC,pos),selected,tower):1);},false);
        if(!animationOwnsPosition&&!detailed&&!flightOpen){const down=(replay?.ground??a.ground)?1:0;e.model.nodeTransformations=new C.PropertyBag({Gear:new C.TranslationRotationScale(C.Cartesian3.ZERO,C.Quaternion.IDENTITY,new C.Cartesian3(down,down,down))});}
      }else if(e.model)e.model=undefined;
    }
    for (const id of positions.current.keys()) if (!ids.has(id)) { v.entities.removeById(id); positions.current.delete(id); rendered.current.delete(id);animatedIds.current.delete(id);modelAttempts.current.delete(id); }
    v.scene.requestRender();
  }, [p.aircraft,p.groundObservations,p.camera.type,towerTarget, p.selected, p.now, p.replayIndex, p.trail, ready, p.preferences.labels,p.preferences.largeLabels,p.preferences.quality,p.preferences.reducedMotion,terrainActive,p.mode,flightOpen,modelCameraRevision,!!p.playback,p.obscured,modelRevision]);
  useEffect(() => {
    const v = viewer.current; if (!v || !ready) return; const C = window.Cesium; const added: Cesium.Entity[] = [];
    if(flightOpen||p.playback||(p.following&&p.replayIndex===null))return;
    for (const {points:segment,color} of coloredTrail(p.replayIndex === null ? p.trail : p.trail.slice(0, p.replayIndex + 1))) {
      if (segment.length < 2) continue;
      added.push(v.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArrayHeights(segment.flatMap(pt => [pt.lon, pt.lat, Math.max(0, pt.altitude) * .3048 + 8])), width: p.following?4:2.5, material: p.following?new C.PolylineOutlineMaterialProperty({color:C.Color.fromCssColorString('#8fdfc8'),outlineColor:C.Color.fromCssColorString('#0b202c'),outlineWidth:1}):C.Color.fromCssColorString(color) } }));
    }
    v.scene.requestRender(); return () => { if (!v.isDestroyed()) for (const e of added) v.entities.remove(e); };
  }, [p.trail, p.replayIndex, ready,flightOpen,!!p.playback,p.following]);
  useEffect(()=>{
    const v=viewer.current,f=p.camera.facility;if(!v||!ready||p.camera.type!=='facility'||!f)return;
    const C=window.Cesium,added:Cesium.Entity[]=[];
    if(f.points?.length){
      added.push(v.entities.add({id:'selected-facility-shape',polyline:{clampToGround:terrainActive,positions:C.Cartesian3.fromDegreesArrayHeights(f.points.flatMap(pt=>[...pt,25])),width:f.kind==='runway'?8:5,material:C.Color.fromCssColorString('#8fdfc8'),depthFailMaterial:C.Color.fromCssColorString('#8fdfc8')}}));
    }
    added.push(v.entities.add({id:'selected-facility-marker',position:C.Cartesian3.fromDegrees(f.lon,f.lat,30),point:{heightReference:terrainActive?C.HeightReference.RELATIVE_TO_GROUND:C.HeightReference.NONE,pixelSize:12,color:C.Color.fromCssColorString('#8fdfc8'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Infinity},label:{heightReference:terrainActive?C.HeightReference.RELATIVE_TO_GROUND:C.HeightReference.NONE,text:f.label,font:p.preferences.largeLabels?'600 18px sans-serif':'600 14px sans-serif',showBackground:true,backgroundColor:C.Color.fromCssColorString('#102b36'),pixelOffset:new C.Cartesian2(0,-30),disableDepthTestDistance:Infinity}}));
    v.scene.requestRender();return()=>{if(!v.isDestroyed())added.forEach(e=>v.entities.remove(e));};
  },[ready,p.camera,p.preferences.largeLabels,terrainActive,p.camera.type,flightOpen]);
  useEffect(()=>{
    const v=viewer.current;if(!v||!ready)return;const C=window.Cesium;const added:Cesium.Entity[]=[];
    if(flightOpen||p.playback)return;
    for(const m of p.movements){if(m.points.length<2)continue;added.push(v.entities.add({id:`movement-${m.hex}`,polyline:{positions:C.Cartesian3.fromDegreesArrayHeights(m.points.flatMap(pt=>[pt.lon,pt.lat,Math.max(0,pt.altitude)*.3048+10])),width:3,material:m.direction==='Approaching'?C.Color.fromCssColorString('#61caff'):new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#ffb56b'),dashLength:12})}}));}
    v.scene.requestRender();return()=>{if(!v.isDestroyed())added.forEach(e=>v.entities.remove(e));};
  },[p.movements,ready,flightOpen,!!p.playback]);
  useEffect(()=>{
    const v=viewer.current;if(!ready||!v)return;const C=window.Cesium;
    const quality=p.preferences.quality;
    // Let requestAnimationFrame follow the display refresh rate; a second 60Hz
    // timer gate can skip browser frames. Battery saver retains its explicit cap.
    if(p.preferences.batterySaver)v.targetFrameRate=20;else Reflect.set(v,'targetFrameRate',undefined); // Cesium supports undefined; its declaration omits it.
    v.resolutionScale=Math.min(p.preferences.batterySaver?.8:devicePixelRatio,quality==='low'?.8:quality==='high'?2:1.25);
    v.scene.globe.maximumScreenSpaceError=quality==='low'?6:quality==='high'?1.5:3;
    v.scene.postProcessStages.fxaa.enabled=quality!=='low';v.scene.requestRender();
    if(!p.preferences.autoQuality||p.preferences.batterySaver)return;
    const governor=new ResolutionGovernor(v.resolutionScale,performance.now());let rendered=0;
    const remove=v.scene.postRender.addEventListener(()=>rendered++);
    const timer=setInterval(()=>{if(v.isDestroyed())return;const frames=rendered;rendered=0;if(document.hidden)return;const next=governor.update(performance.now(),readRenderStats(v).p95,frames);if(Math.abs(next-v.resolutionScale)>.001){v.resolutionScale=next;v.scene.requestRender();}},2000);
    return()=>{remove();clearInterval(timer);};
  },[ready,p.preferences.quality,p.preferences.batterySaver,p.preferences.autoQuality]);
  useEffect(()=>{
    const v=viewer.current;if(!ready||!v)return;const C=window.Cesium;let lastLabels=0,lastSlowMotion=0,lastAnimation=0,orderedAt=-Infinity,orderedSelection:string|undefined;let orderedIds:string[]=[];
    const drawn=new Map<string,string>(),motion=sharedLiveMotion;
    const animate=()=>{
      if(v.isDestroyed()||document.hidden||callbacks.current.obscured||callbacks.current.playback||lostRef.current)return;const s=callbacks.current;const tick=performance.now();const markerTick=s.camera.type==='tower'||tick-lastAnimation>=(s.preferences.batterySaver?100:50);if(markerTick)lastAnimation=tick;let changed=false;
      if(s.preferences.batterySaver){const active=cameraMoving.current||flightOpen||s.aircraft.some(a=>a.observedAt!==null&&Date.now()-a.observedAt<(a.ground?8000:120000)&&(a.groundSpeed??0)>2);v.targetFrameRate=active?20:5;}
      if(!s.preferences.reducedMotion){
        const slowTick=Date.now()-lastSlowMotion>=1000;if(slowTick)lastSlowMotion=Date.now();
        let count=0;const limit=s.preferences.quality==='high'?240:s.preferences.quality==='low'?40:100;
        // Reuse the priority order between feed/model changes instead of sorting every frame.
        if(tick-orderedAt>=250||orderedIds.length!==positions.current.size||orderedSelection!==s.selected?.hex){
          orderedIds=[...positions.current.keys()].sort((a,b)=>(Number(positions.current.get(b)?.hex===s.selected?.hex)*2+Number(!!v.entities.getById(b)?.model))-(Number(positions.current.get(a)?.hex===s.selected?.hex)*2+Number(!!v.entities.getById(a)?.model)));
          orderedAt=tick;orderedSelection=s.selected?.hex;
        }
        for(const id of orderedIds){
          const a=positions.current.get(id);if(!a)continue;
          const selected=a.hex===s.selected?.hex;
          if(a.targetKind!=='aircraft'||(selected&&(flightOpen||s.replayIndex!==null)))continue;
          const e=v.entities.getById(id);
          // Nearby 3D aircraft move at render cadence; distant map markers keep their cheaper cadence.
          if(!e||(!markerTick&&!slowTick&&!selected&&!e.model))continue;
          const current=e.position?.getValue(v.clock.currentTime);if(!current)continue;
          if(!slowTick&&!selected&&C.Cartesian3.distance(current,v.camera.positionWC)>Math.max(100000,v.camera.positionCartographic.height*3))continue;
          if(!slowTick&&!selected){const screen=C.SceneTransforms.worldToWindowCoordinates(v.scene,current);if(!screen||screen.x<0||screen.y<0||screen.x>v.canvas.clientWidth||screen.y>v.canvas.clientHeight)continue;}
          if(count++>=limit&&!slowTick)continue;
          const nearbyAirport=(a.ground||s.camera.type==='tower')?s.geometry?.airports.find(port=>a.lat!==null&&a.lon!==null&&trackDistance({lat:a.lat,lon:a.lon},port)<12):null;
          const airport=(selected?s.arrivalGeometry:null)??(nearbyAirport?withAirportElevation(nearbyAirport):null);
          const fix=motion.sample(a,s.histories.get(a.hex)??[],Date.now(),false,selected?s.route:null,airport);if(!fix)continue;animatedIds.current.add(id);
          const displayAltitude=fix.ground?(surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(fix.lon,fix.lat))))/.3048:fix.simulationElevationFt!==undefined?Math.max(0,fix.altitude-fix.simulationElevationFt)+(surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(fix.lon,fix.lat))))/.3048:fix.landingPhase?Math.max(0,fix.altitude-(airport?.elevationFt??0))+(surfaceHeight(v.scene.globe.getHeight(C.Cartographic.fromDegrees(fix.lon,fix.lat))))/.3048:fix.altitude;
          const clearance=String(e.model?.uri?.getValue(v.clock.currentTime)).includes('/models/sourced/')?sourcedGearClearance(a.aircraftType,8)-gearCompression(e):8;
          const key=`${fix.lon}/${fix.lat}/${displayAltitude}/${clearance}`;const desired=C.Cartesian3.fromDegrees(fix.lon,fix.lat,(Math.max(0,displayAltitude)+(fix.groundClearance??0))*.3048+clearance);if(drawn.get(id)===key&&C.Cartesian3.equalsEpsilon(current,desired,0,.01)&&!rotorRig(String(e.model?.uri?.getValue(v.clock.currentTime)??'')))continue;drawn.set(id,key);
          const pos=C.Cartesian3.fromDegrees(fix.lon,fix.lat,(Math.max(0,displayAltitude)+(fix.groundClearance??0))*.3048+clearance);
          if(e.position instanceof C.ConstantPositionProperty)e.position.setValue(pos);else e.position=new C.ConstantPositionProperty(pos);
          const heading='heading' in fix?fix.heading:a.heading??0;
          const animation=aircraftAnimation.sample(e,{...fix,groundSpeed:fix.groundSpeed??a.groundSpeed??0},Date.now(),s.preferences.reducedMotion);
          const orientation=C.Transforms.headingPitchRollQuaternion(pos,new C.HeadingPitchRoll(...aircraftModelAttitude(heading,fix.pitch??0,animation.bank)));if(e.orientation instanceof C.ConstantProperty)e.orientation.setValue(orientation);else e.orientation=new C.ConstantProperty(orientation);if(e.model)applyAircraftRig(e,Date.now()/1000,fix.groundSpeed??a.groundSpeed??0,animation.gear,(fix.turnRate??0)*.1,animation.flaps,heading,fix.ground);
          if(e.billboard){if(e.billboard.rotation instanceof C.ConstantProperty)e.billboard.rotation.setValue(-heading*Math.PI/180);else e.billboard.rotation=new C.ConstantProperty(-heading*Math.PI/180);}changed=true;
        }
      }
      if(Date.now()-lastLabels>500){
        lastLabels=Date.now();readyModels.current.clear();
        const fail=(id:string)=>{const attempt=modelAttempts.current.get(id);if(!attempt||attempt.stage==='marker')return;qualityEvent('model','failed',`Rendering failed; ${attempt.stage} fallback`);modelAttempts.current.set(id,failedModel(attempt,Date.now()));const entity=v.entities.getById(id);if(entity)entity.model=undefined;readyModels.current.delete(id);rendered.current.delete(id);setModelRevision(n=>n+1);};
        for(let i=0;i<v.scene.primitives.length;i++){const primitive=v.scene.primitives.get(i);if(!(primitive instanceof C.Model)||typeof primitive.id?.id!=='string')continue;const id=primitive.id.id;if(primitive.ready&&primitive.show)readyModels.current.add(id);if(!watchedModels.current.has(primitive)){watchedModels.current.add(primitive);primitive.errorEvent.addEventListener(()=>{if(!v.isDestroyed()&&v.scene.primitives.contains(primitive))fail(id);});}}
        for(const [id,attempt] of modelAttempts.current){const entity=v.entities.getById(id);if(!entity?.model||!entity.show)continue;if(readyModels.current.has(id)){if(!attempt.ready)modelLoadStats(v,readRenderStats(v).pendingModels,readRenderStats(v).slowModels,Date.now()-attempt.since);attempt.ready=true;}else if(modelTimedOut(attempt,Date.now()))fail(id);}
        const loading=[...modelAttempts.current.entries()].filter(([id,a])=>v.entities.getById(id)?.model&&!a.ready);modelLoadStats(v,loading.length,loading.filter(([,a])=>Date.now()-a.since>5000).length);
        setSelectedModelReady(!!s.selected&&readyModels.current.has(`aircraft-${s.selected.hex}`));
        for(const [id,a] of positions.current){const e=v.entities.getById(id);if(!e?.billboard)continue;const selected=a.hex===s.selected?.hex,loaded=!!e.model&&readyModels.current.has(id),near=loaded?modelRange(selected,s.camera.type==='tower')*.7:0,dc=e.billboard.distanceDisplayCondition?.getValue(v.clock.currentTime);if(dc&&dc.near!==near){e.billboard.distanceDisplayCondition=new C.ConstantProperty(new C.DistanceDisplayCondition(near,dc.far));e.billboard.translucencyByDistance=loaded?new C.ConstantProperty(new C.NearFarScalar(modelRange(selected,s.camera.type==='tower')*.7,0,modelRange(selected,s.camera.type==='tower'),1)):undefined;changed=true;}}
        const boxes:{x:number;y:number;width:number}[]=[];
        const canvasRect=v.canvas.getBoundingClientRect();
        const blocked=[...document.querySelectorAll('.map-title,.map-primary-controls,.camera-traffic-status,.flight-view-trigger')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left-canvasRect.left,top:r.top-canvasRect.top,right:r.right-canvasRect.left,bottom:r.bottom-canvasRect.top};});
        const occluder=new C.Occluder(new C.BoundingSphere(C.Cartesian3.ZERO,v.scene.globe.ellipsoid.minimumRadius),v.camera.positionWC);
        const reserve=(e:Cesium.Entity,text:string,range:number,always=false)=>{
          const pos=e.position?.getValue(v.clock.currentTime);if(!pos)return false;
          const pt=C.SceneTransforms.worldToWindowCoordinates(v.scene,pos);
          if(!pt||pt.x<0||pt.y<0||pt.x>v.canvas.clientWidth||pt.y>v.canvas.clientHeight||C.Cartesian3.distance(pos,v.camera.positionWC)>range||(v.scene.mode===C.SceneMode.SCENE3D&&!occluder.isPointVisible(pos)))return always;
          pt.y-=23;
          const width=text.length*(s.preferences.largeLabels?9:7)+10;
          if(blocked.some(r=>pt.x+width/2>r.left&&pt.x-width/2<r.right&&pt.y+12>r.top&&pt.y-12<r.bottom))return false;
          if(!always&&(boxes.length>=Math.min(60,Math.max(12,Math.floor(v.canvas.clientWidth*v.canvas.clientHeight/14000)))||boxes.some(b=>Math.abs(b.x-pt.x)<(b.width+width)/2&&Math.abs(b.y-pt.y)<26)))return false;
          boxes.push({x:pt.x,y:pt.y,width});return true;
        };
        const ordered=[...positions.current.entries()].sort((a,b)=>Number(b[1].hex===s.selected?.hex)-Number(a[1].hex===s.selected?.hex));
        for(const [id,a] of ordered){const e=v.entities.getById(id);if(!e?.label)continue;const selected=a.hex===s.selected?.hex;
          let show=!(selected&&flightOpen)&&(selected||s.preferences.labels);
          if(show&&s.preferences.declutter)show=reserve(e,e.label.text?.getValue(v.clock.currentTime)??a.hex,selected?40000000:80000,selected);
          if(e.label.show?.getValue(v.clock.currentTime)!==show){e.label.show=new C.ConstantProperty(show);changed=true;}
        }
        for(const e of v.entities.values){
          if(!e.id.startsWith('facility-')||!e.label||!e.point)continue;
          const show=s.preferences.labels&&(!s.preferences.declutter||reserve(e,e.label.text?.getValue(v.clock.currentTime)??'',3000));
          if(e.label.show?.getValue(v.clock.currentTime)!==show){e.label.show=new C.ConstantProperty(show);changed=true;}
        }
        for(const id of drawn.keys())if(!positions.current.has(id))drawn.delete(id);
      }
      if(changed)v.scene.requestRender();
    };
    const removeFrame=v.scene.preUpdate.addEventListener(animate);
    return()=>{removeFrame();animatedIds.current.clear();};
  },[ready,p.preferences.quality,p.preferences.batterySaver,flightOpen]);
  const selectedRef = useRef(p.selected); selectedRef.current = p.selected;
  useEffect(() => {
    const v = viewer.current; if (!v || !ready) return; const C = window.Cesium;
    v.trackedEntity = undefined; v.camera.lookAtTransform(C.Matrix4.IDENTITY);
    const duration = callbacks.current.preferences.reducedMotion ? 0 : 1.2;
    if(firstRecovery.current){const pose=firstRecovery.current;firstRecovery.current=null;v.camera.setView({destination:C.Cartesian3.fromDegrees(pose.lon,pose.lat,pose.height),orientation:{heading:pose.heading,pitch:pose.pitch,roll:pose.roll}});if(p.following&&p.selected)v.trackedEntity=v.entities.getById(`aircraft-${p.selected.hex}`);return;}
    if(p.camera.type==='tower'){return;} else if(p.camera.type==='overview'){
      const g=callbacks.current.geometry?.airports.find(a=>a.id===p.camera.airport);if(!g)return;
      const pts=airportPoints(g);const sphere=C.BoundingSphere.fromPoints((pts.length?pts:[[g.lon,g.lat]]).map(pt=>C.Cartesian3.fromDegrees(pt[0],pt[1])));sphere.radius=Math.max(1800,sphere.radius*1.25);
      v.camera.flyToBoundingSphere(sphere,{offset:new C.HeadingPitchRange(0,-Math.PI/2,0),duration});
    } else if(p.camera.type==='route'){
      const route=callbacks.current.route,a=selectedRef.current;
      if(!route||route.airports.length!==2||!['PLAUSIBLE','UNVERIFIED'].includes(route.status))return;
      const points=[...routeArc(route.airports[0],route.airports[1]),...callbacks.current.trail].map(a=>C.Cartesian3.fromDegrees(a.lon,a.lat));
      if(a&&hasPosition(a))points.push(C.Cartesian3.fromDegrees(a.lon!,a.lat!,Math.max(0,a.altitude??0)*.3048));
      const sphere=C.BoundingSphere.fromPoints(points);sphere.radius=Math.max(15000,sphere.radius*1.35);
      v.camera.flyToBoundingSphere(sphere,{offset:new C.HeadingPitchRange(0,-Math.PI/2,0),duration});
    } else if (p.camera.type === 'night') {
      const sun=sunDirectionFixed(C,v.clock.currentTime);
      const lon=Math.atan2(-sun.y,-sun.x)*180/Math.PI,lat=Math.asin(-sun.z)*180/Math.PI;
      v.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,14000000),orientation:{heading:0,pitch:-Math.PI/2,roll:0},duration});
    } else if (p.camera.type === 'world') {
      v.camera.flyTo({ destination: C.Cartesian3.fromDegrees(-25, 27, 12000000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration });
    } else {
      const aircraft = selectedRef.current;
      const airport = p.camera.airport ? AIRPORTS[p.camera.airport] : null;
      const facility = p.camera.facility;
      const isAircraft = p.camera.type === 'aircraft' && aircraft && hasPosition(aircraft);
      if (!isAircraft && !airport && !facility) return;
      const lon = facility?.lon ?? (isAircraft ? aircraft.lon! : airport!.lon);
      const lat = facility?.lat ?? (isAircraft ? aircraft.lat! : airport!.lat);
      const altitude = isAircraft ? Math.max(0, aircraft.altitude ?? 0) * .3048 : 0;
      const entity = isAircraft ? v.entities.getById(`aircraft-${aircraft.hex}`) : undefined;
      if (entity) entity.viewFrom = new C.ConstantProperty(new C.Cartesian3(0, -14000, 18000));
      v.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(lon, lat, altitude), 1), {
        offset: new C.HeadingPitchRange(0, C.Math.toRadians(p.mode === '2D' ? -90 : facility?.kind==='airport3d' ? -32 : -65), facility?.range ?? (isAircraft ? (p.mode === '2D' ? 150000 : 18000) : (v.canvas.clientWidth > 700 ? 12500 : 10500))), duration,
        complete: () => { if (entity && callbacks.current.following && !v.isDestroyed()) v.trackedEntity = entity; },
      });
    }
    return () => { if (!v.isDestroyed()) v.camera.cancelFlight(); };
  }, [p.camera, p.mode, ready]);
  useEffect(() => {
    const v=viewer.current; if(!v || !ready || p.following) return;
    v.trackedEntity=undefined; v.camera.lookAtTransform(window.Cesium.Matrix4.IDENTITY); v.scene.requestRender();
  }, [p.following,ready]);
  useEffect(() => {
    const v=viewer.current; if(!v || !ready || previousCommand.current===p.command.serial) return;previousCommand.current=p.command.serial;
    v.camera.cancelFlight();v.trackedEntity=undefined;v.camera.lookAtTransform(window.Cesium.Matrix4.IDENTITY);
    moveCamera(v,p.command.action);callbacks.current.onInteract();v.scene.requestRender();
  }, [p.command,ready]);
  const fitCompleteRoute=()=>{const v=viewer.current,r=callbacks.current.route;if(!v||v.isDestroyed()||!r||r.airports.length!==2)return;const C=window.Cesium,a=callbacks.current.selected;const points=[...routeArc(r.airports[0],r.airports[1]),...callbacks.current.trail,...(a&&a.lon!==null&&a.lat!==null?[{lon:a.lon,lat:a.lat}]:[])];const sphere=C.BoundingSphere.fromPoints(points.map(x=>C.Cartesian3.fromDegrees(x.lon,x.lat)));sphere.radius=Math.max(15000,sphere.radius*1.4);v.trackedEntity=undefined;v.camera.flyToBoundingSphere(sphere,{duration:callbacks.current.preferences.reducedMotion?0:1.2,offset:new C.HeadingPitchRange(0,-Math.PI/2,0)});};
  const previousZoom = useRef(p.zoomSignal);
  useEffect(() => { const v = viewer.current; if (!v || !ready) return; const delta = p.zoomSignal - previousZoom.current; previousZoom.current = p.zoomSignal; if(delta){v.camera.cancelFlight();v.trackedEntity=undefined;v.camera.lookAtTransform(window.Cesium.Matrix4.IDENTITY);callbacks.current.onInteract();} if (delta > 0) v.camera.zoomIn(v.camera.positionCartographic.height * .4); if (delta < 0) v.camera.zoomOut(v.camera.positionCartographic.height * .6); v.scene.requestRender(); }, [p.zoomSignal, ready]);
  return <><WaterSurface viewer={ready?viewer.current:null} enabled={p.preferences.waterMotion&&p.mode==='3D'&&!p.obscured} quality={p.preferences.quality} reduced={p.preferences.reducedMotion} satellite={satellite}/><CityBuildings viewer={ready?viewer.current:null} enabled={p.preferences.cityBuildings&&p.mode==='3D'&&!p.obscured} quality={p.preferences.quality} terrain={terrainActive} airports={detailAirports} airportStructures={p.preferences.structures||p.camera.type==='tower'||flightOpen} statusHost={p.toolsHost}/><WeatherLayer overview viewer={ready?viewer.current:null} enabled={ready&&p.mode==='3D'&&!p.playback&&p.replayIndex===null&&!p.obscured} reduced={p.preferences.reducedMotion} lowQuality={p.preferences.quality==='low'} statusHost={p.toolsHost} focus={()=>{const v=viewer.current;if(!v||v.isDestroyed()||v.camera.positionCartographic.height>200000)return null;const C=window.Cesium,a=callbacks.current.selected,entity=flightOpen&&a?(v.entities.getById('flight-simulation')??v.entities.getById(`aircraft-${a.hex}`)):null,pos=entity?.position?.getValue(v.clock.currentTime);const c=pos?C.Cartographic.fromCartesian(pos):v.camera.positionCartographic;return {lat:C.Math.toDegrees(c.latitude),lon:C.Math.toDegrees(c.longitude),altitudeM:c.height};}}/>{p.density&&<DensityLayer viewer={ready?viewer.current:null} cells={p.density}/>}
    <AirportDetailLayer lightingEnabled={p.mode==='3D'} reduced={p.preferences.reducedMotion} viewer={ready?viewer.current:null} airports={detailAirports} enabled={p.mode==='3D'&&(p.preferences.structures||p.camera.type==='tower'||flightOpen)} quality={p.preferences.quality}/>{p.groundAnimation&&p.mode==='3D'&&!flightOpen&&<Suspense fallback={null}><GroundAnimation viewer={ready?viewer.current:null} airport={p.geometry?.airports[0]} observations={p.groundObservations} close={p.closeGround} reduced={p.preferences.reducedMotion} suspended={p.obscured}/></Suspense>}{p.camera.type==='route'&&!flightOpen&&!p.playback&&p.route?.airports.length===2&&['PLAUSIBLE','UNVERIFIED'].includes(p.route.status)&&<RouteMode route={p.route} fit={fitCompleteRoute} close={p.exitRoute}/>}<FollowFlightPath viewer={ready?viewer.current:null} aircraft={p.selected} trail={p.trail} route={p.route} active={p.following&&!flightOpen&&!p.playback&&p.replayIndex===null}/><RouteLayer viewer={ready?viewer.current:null} route={p.route} aircraft={p.selected} trail={p.trail} follow={p.following} active={(p.camera.type==='route'||p.following)&&!flightOpen&&!p.playback}/><SkyBoundary><Suspense fallback={null}><CelestialSky navigationKey={`${p.camera.serial}-${p.command.serial}`} viewer={ready?viewer.current:null} enabled={ready&&p.mode==='3D'&&!flightOpen&&!p.playback} host={p.toolsHost} onInteract={p.onInteract} reduced={p.preferences.reducedMotion}/></Suspense></SkyBoundary>{p.toolsHost&&createPortal(<div className="globe-utilities"><CameraBookmarks viewer={ready?viewer.current:null} mode={p.mode} preferences={p.preferences} restore={p.bookmarkRestore}/><PerformanceMonitor viewer={ready?viewer.current:null} quality={p.preferences.quality} automatic={p.automatic} feed={p.feedHealth}/></div>,p.toolsHost)}<SpotterCamera viewer={ready?viewer.current:null} mode={p.spotterMode} paused={p.spotterPaused} selected={p.selected} airport={p.geometry?.airports[0]}/>{p.playback&&<SessionReplayLayer skipInitialFrame={!!p.recoveryPose} labels={p.preferences.labels} viewer={ready?viewer.current:null} recording={p.playback.recording} time={p.playback.time}/>}<TowerView onTarget={setTowerTarget} observations={p.groundObservations} reduced={p.preferences.reducedMotion} suspended={p.obscured} viewer={ready?viewer.current:null} airport={p.geometry?.airports[0]} active={p.camera.type==='tower'&&p.mode==='3D'} close={()=>p.onAirport(p.camera.airport!)}/><AtlasLayer viewer={ready?viewer.current:null} active={!satellite&&(p.preferences.basemap==='atlas'||!!imageryError)} labels={p.preferences.labels} large={p.preferences.largeLabels}/><CityLabels flight={flightOpen||p.following} aircraftHex={p.selected?.hex} viewer={ready?viewer.current:null} cities={cities} enabled={p.preferences.labels} large={p.preferences.largeLabels}/><Suspense fallback={null}>{p.selected&&<FlightExperience flightHost={p.flightHost} request={p.flightRequest} onScene={p.onFlightScene} observations={p.groundObservations} arrivalGeometry={p.arrivalGeometry} modelStage={modelAttempts.current.get(`aircraft-${p.selected?.hex}`)?.stage??'primary'} retryModel={retryModel} modelReady={selectedModelReady} suspended={p.obscured||contextLost} quality={p.preferences.quality} feedHealth={p.feedHealth} cities={cities} onOpenChange={setFlightOpen} navigationKey={`${p.camera.serial}-${p.command.serial}-${p.zoomSignal}`} viewer={ready?viewer.current:null} aircraft={p.selected} trail={p.trail} geometry={p.geometry} route={p.route} reducedMotion={p.preferences.reducedMotion} mode={p.mode} replay={p.replayIndex!==null||!!p.playback} onRoute={fitCompleteRoute}/>}</Suspense><div ref={container} className="globe" aria-label={`${p.mode === '3D' ? '3D globe' : '2D map'} of aircraft`}/><div className="map-readout" aria-label="Map orientation and scale"><span className="north-indicator" title="Camera heading"><b style={{transform:`rotate(${-readout.heading}deg)`}}>↑</b>N <small>{readout.heading}°</small></span>{readout.scale && <span className="scale-bar" style={{width:readout.width}}>{readout.scale}</span>}<span className="basemap-caption">{tilesLoading?'Loading map detail…':satellite?'Satellite imagery':p.preferences.basemap==='satellite'&&!imageryError?'Loading imagery…':'Atlas'}</span></div>
    {hover&&<div className="aircraft-tooltip" style={{left:Math.max(8,hover.x),top:hover.y}}><strong>{hover.aircraft.callsign||hover.aircraft.registration||hover.aircraft.hex}</strong><span>{hover.aircraft.aircraftType||'Type unknown'} · {hover.aircraft.ground?'Ground':`${hover.aircraft.altitude?.toLocaleString()??'Unknown'} ft`}</span><small>Click for flight details · {hover.aircraft.simulation?'Skyward simulated aircraft':`${Math.round(ageSeconds(hover.aircraft,p.now))}s since fix`}</small></div>}
    {p.replayIndex!==null&&<div className="replay-banner">Replay · recorded observations · other aircraft show latest reports</div>}
    {error && <div className="map-error" role="alert">{error}<button className="text-button" onClick={()=>p.recover(null,true)}>Restart globe</button></div>}{mapError && <div className="map-error" role="status">{mapError}<button className="text-button" onClick={()=>{setMapAttempt(n=>n+1);window.dispatchEvent(new Event('online'));}}>Retry map &amp; traffic</button></div>}
    {terrainError&&<div className="terrain-warning" role="status">Some elevation tiles are unavailable. Loaded terrain remains visible. <button onClick={()=>{setTerrainError(false);retryTerrain(n=>n+1);}}>Retry elevation</button></div>}
    {imageryError && <div className="imagery-warning" role="status">{imageryError}<button onClick={()=>retryImagery(n=>n+1)}>Retry imagery</button></div>}</>;
}

function moveCamera(v: Cesium.Viewer, action: MapCommand['action']) {
  const C=window.Cesium;
  if(v.scene.mode===C.SceneMode.SCENE2D){
    if(action==='left'||action==='right')v.camera.moveRight(v.camera.positionCartographic.height*.2*(action==='left'?-1:1));
    return;
  }
  if(action==='north'){v.camera.setView({orientation:{heading:0,pitch:v.camera.pitch,roll:0}});return;}
  if(v.camera.positionCartographic.height>1000000 && action!=='tilt'){
    v.camera.rotateRight(C.Math.toRadians(action==='left'?-15:15));return;
  }
  const center=new C.Cartesian2(v.canvas.clientWidth/2,v.canvas.clientHeight/2);
  const pivot=v.camera.pickEllipsoid(center,v.scene.globe.ellipsoid);
  if(!pivot)return;
  const range=C.Cartesian3.distance(v.camera.positionWC,pivot);
  const heading=v.camera.heading+(action==='left'?-.25:action==='right'?.25:0);
  const pitch=action==='tilt'?(v.camera.pitch< -1.1 ? -.65 : -Math.PI/2):v.camera.pitch;
  v.camera.lookAt(pivot,new C.HeadingPitchRange(heading,pitch,range));v.camera.lookAtTransform(C.Matrix4.IDENTITY);
}
