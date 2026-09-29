import {TripFollower} from './components/TripFollower';
import {parseRecording} from './lib/sessionRecording';
import {loadAirportGeometry} from './lib/geographyLoader';
import {flightHeaderRoute} from './lib/flightHeader';
import {busyObservedAirports} from './lib/discovery';
import type {AlertDestination} from './lib/destinationAlerts';
import {interestingFlight,type FlightRequest,type FlightScene} from './lib/watchDiscovery';
import {NearbyTraffic} from './components/NearbyTraffic';
import {initialViewHash} from './lib/resumeView';
import {cameraSnapshot,encodeCamera} from './lib/sharedCamera';
import {Upgrade} from './components/Upgrade';
import type * as Cesium from 'cesium';
import {useArrivalGeometry} from './lib/useArrivalGeometry';
import {readFlightPreferences,saveFlightPreferences} from './lib/flightPreferences';
import {RouteSettings} from './components/RouteSettings';
import {MapTools,MapToolAction} from './components/MapTools';
import {staleAircraft} from './lib/aircraftFreshness';
import {QuickSearch} from './components/QuickSearch';
import type {SpotterCameraMode} from './components/SpotterCamera';
import {Spotter} from './components/Spotter';
import {SessionReplayControls} from './components/SessionReplay';
import {useSessionRecorder} from './lib/useSessionRecorder';
import {recordingBounds,type Recording} from './lib/sessionRecording';
import {densityCells} from './lib/density';
import type {RecoveryPose} from './components/Globe';
import {CoverageStatus} from './components/CoverageStatus';
import {emptyFilters,filtersActive,matchesFilters} from './lib/trafficFilters';
import {trafficRegions} from './lib/cameraTraffic';
import {useCameraTraffic} from './lib/useCameraTraffic';
import type {CameraArea} from './lib/cameraTraffic';
import type {ExploreTab} from './components/ExploreTools';
import {useOfflineMaps} from './lib/offlineMaps';
import {lowerQuality,type Quality} from './lib/adaptiveQuality';
import {movement} from './lib/exploration';
import { FeedHealth } from './components/FeedHealth';
import { WatchAlerts } from './components/WatchAlerts';
import { ShareView } from './components/ShareView';
import { distanceNm, matchesTraffic, parseView, type TrafficFilter } from './lib/experience';
import {airport3DTarget} from './lib/airportBuildings';
import { airportFacilities } from './components/AirportInspector';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Globe2, Map as MapIcon, Plus, Minus, Crosshair, Star, Info, Menu, X, ExternalLink, RotateCcw, RotateCw, Orbit, CircleHelp } from 'lucide-react';
import { MapLayers } from './components/MapLayers';
import {WelcomeGuide} from './components/WelcomeGuide';
import { useMapPreferences } from './lib/mapPreferences';
const Globe=lazy(()=>import('./components/Globe').then(m=>({default:m.Globe})));
const AboutData=lazy(()=>import('./components/AboutData').then(m=>({default:m.AboutData})));
import { Sidebar } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { AirportInspector } from './components/AirportInspector';
import { useFlightRoute } from './lib/useFlightRoute';
import { useObservatory } from './lib/useObservatory';
import { AIRPORTS, type Aircraft, type AirportId, type CameraTarget, type GeometryFile, type FacilityTarget, type MapCommand, type TrailPoint } from './types';

const ControlsHelp=lazy(()=>import('./components/ControlsHelp').then(m=>({default:m.ControlsHelp})));
const ExploreTools=lazy(()=>import('./components/ExploreTools').then(m=>({default:m.ExploreTools})));


export default function App() {
  const [groundAnimation,setGroundAnimation]=useState(false);
  const [initialHash]=useState(initialViewHash);
  const [mobileMore,setMobileMore]=useState(false);
  const [focusMode,setFocusMode]=useState(()=>readFlightPreferences().focus);
  useEffect(()=>{saveFlightPreferences({focus:focusMode});},[focusMode]);
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))setFocusMode(false);};addEventListener('keydown',escape);return()=>removeEventListener('keydown',escape);},[]);
  const [toolsHost,setToolsHost]=useState<HTMLDivElement|null>(null);
  const [hideStale,setHideStale]=useState(false);
  const [preferences, setPreferences] = useMapPreferences();
  const [searchOpen,setSearchOpen]=useState(false);
  const [spotterMode,setSpotterMode]=useState<SpotterCameraMode>('follow'),[spotterPaused,setSpotterPaused]=useState(false);
  const [spotter,setSpotter]=useState(false),[density,setDensity]=useState(false);
  const [session,setSession]=useState<Recording|null>(null),[sessionTime,setSessionTime]=useState(0);
  const sharedViewer=useRef<Cesium.Viewer|null>(null);
  const onViewer=useCallback((v:Cesium.Viewer|null)=>{sharedViewer.current=v;},[]);
  const [globeKey,setGlobeKey]=useState(0),[recoveryPose,setRecoveryPose]=useState<RecoveryPose|null>(()=>{const v=parseView(initialHash);return v.aircraft||v.facility?null:v.camera;});
  const recoveryAttempts=useRef(0);
  const recoverGlobe=(pose:RecoveryPose|null,manual=false)=>{if(!manual&&recoveryAttempts.current>=2)return false;recoveryAttempts.current=manual?0:recoveryAttempts.current+1;setRecoveryPose(pose);setReady(false);setGlobeKey(n=>n+1);return true;};
  const offline=useOfflineMaps(preferences.offlineMaps);
  const [automatic,setAutomatic]=useState<Quality|null>(null),[exploreTab,setExploreTab]=useState<ExploreTab>('discover');
  useEffect(()=>setAutomatic(null),[preferences.quality,preferences.autoQuality]);
  const effectivePreferences={...preferences,quality:lowerQuality(preferences.quality,preferences.autoQuality?automatic:null),basemap:offline.online?preferences.basemap:'atlas' as const};
  const openTools=(tab:ExploreTab)=>{setExploreTab(tab);setExplore(true);};
  const [explore,setExplore]=useState(false);
  const [showMovements,setShowMovements]=useState(false);
  const [help, setHelp] = useState(false);
  const [guide,setGuide]=useState(()=>{try{return !location.hash&&!location.search&&localStorage.getItem('skyward.guide.v1')!=='done';}catch{return false;}});
  const closeGuide=()=>{setGuide(false);try{localStorage.setItem('skyward.guide.v1','done');}catch{}};
  const [shared] = useState(()=>parseView(initialHash));
  const initialIntent = useRef(true);
  const [alertsEnabled,setAlertsEnabled]=useState(()=>{try{return localStorage.getItem('skyward.alerts.enabled.v1')==='true';}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem('skyward.alerts.enabled.v1',String(alertsEnabled));}catch{}},[alertsEnabled]);
  const [filters,setFilters]=useState({...emptyFilters});
  const [trafficFilter,setTrafficFilter]=useState<TrafficFilter>('all');
  const [airport, setAirport] = useState<AirportId>(shared.airport);
  const [mode, setMode] = useState<'3D' | '2D'>(shared.mode);
  const [watching, setWatching] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
  const [about, setAbout] = useState(false); const [ready, setReady] = useState(false);
  const [geometryAttempt,setGeometryAttempt]=useState(0);
  const [now, setNow] = useState(Date.now()); const [geometry, setGeometry] = useState<GeometryFile | null>(null); const [geometryError, setGeometryError] = useState(false);
  const [camera, setCamera] = useState<CameraTarget>({ type: shared.hasView ? (new URLSearchParams(location.search).get('airportView')==='tower'?'tower':new URLSearchParams(location.search).get('airportView')==='overhead'?'overview':'airport'):'world', airport:shared.airport, serial: 0 }); const [zoom, setZoom] = useState(0); const [replayIndex, setReplay] = useState<number | null>(null);
  const mapStage = useRef<HTMLElement>(null);
  useEffect(() => {
    const sidebar=document.getElementById('aircraft-browser');
    const mq=matchMedia('(max-width:759px)');
    const update=()=>{if(sidebar)sidebar.inert=mq.matches&&!mobileOpen;};
    update();mq.addEventListener('change',update);
    if(mobileOpen&&mq.matches)sidebar?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&mobileOpen){setMobileOpen(false);document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();}};
    document.addEventListener('keydown',key);
    return()=>{mq.removeEventListener('change',update);document.removeEventListener('keydown',key);};
  },[mobileOpen]);
  const feed = useObservatory(airport,alertsEnabled);
  const [trafficArea,setTrafficArea]=useState<CameraArea|null>(null);
  const cameraTraffic=useCameraTraffic(trafficArea,feed.ingest,feed.observations);
  const recordingRows=useMemo(()=>[...feed.aircraft,...cameraTraffic.aircraft,...(feed.selected?[feed.selected]:[])],[feed.aircraft,cameraTraffic.aircraft,feed.selected]);
  const receivedAircraft=useMemo(()=>{const latest=new Map<string,Aircraft>();for(const a of [...recordingRows,...feed.observations]){const old=latest.get(a.hex);if(!old||(a.observedAt??0)>(old.observedAt??0))latest.set(a.hex,a);}return [...latest.values()];},[recordingRows,feed.observations]);
  const recorder=useSessionRecorder(recordingRows);
  useEffect(()=>{
    if(!preferences.resumeView||!ready)return;
    const save=()=>{if(session)return;const pose=cameraSnapshot(sharedViewer.current);if(!pose)return;const q=new URLSearchParams({airport,mode,camera:encodeCamera(pose)});if(feed.selected)q.set('aircraft',feed.selected.hex);try{localStorage.setItem('skyward.resume.v1',JSON.stringify({hash:'#'+q,time:Date.now()}));}catch{}};
    const timer=setInterval(save,5000);addEventListener('pagehide',save);return()=>{clearInterval(timer);removeEventListener('pagehide',save);};
  },[preferences.resumeView,ready,airport,mode,feed.selected?.hex,session]);
  const densityTick=Math.floor(now/10000);const cells=useMemo(()=>density?densityCells(feed.motionHistories,now):[],[density,densityTick,feed.motionHistories]);
  const playSession=(r:Recording)=>{setGroundAnimation(false);setRecoveryPose(null);if(recorder.recording)recorder.stop();setSpotter(false);setFollowing(false);setReplay(null);setSession(r);setSessionTime(recordingBounds(r).start);setExplore(false);};
  useEffect(()=>{const replay=(event:Event)=>{try{playSession(parseRecording((event as CustomEvent).detail));}catch{}};window.addEventListener('skyward-cloud-replay',replay);return()=>window.removeEventListener('skyward-cloud-replay',replay);});

  const cameraPlace=useMemo(()=>{if(!trafficArea)return '';let closest='',best=150;for(const a of Object.values(AIRPORTS)){const distance=distanceNm(trafficArea.lat,trafficArea.lon,a.lat,a.lon);if(distance<best){best=distance;closest=a.city||a.name;}}return closest;},[trafficArea?.lat,trafficArea?.lon]);
  const viewingElsewhere=!!trafficArea&&!!camera.airport&&distanceNm(trafficArea.lat,trafficArea.lon,AIRPORTS[camera.airport].lat,AIRPORTS[camera.airport].lon)>25;
  const areaDescription=trafficArea?`Camera area${cameraPlace?` near ${cameraPlace}`:''} · ${trafficArea.lat.toFixed(1)}°, ${trafficArea.lon.toFixed(1)}° · ${trafficRegions(trafficArea).length} area${trafficRegions(trafficArea).length===1?'':'s'} · up to ${trafficArea.radius} nm each`:`Move the camera toward the Earth`;
  const movements=useMemo(()=>feed.aircraft.map(a=>movement(a,feed.histories.get(a.hex)??[],airport,now)).filter((m):m is NonNullable<typeof m>=>m!==null).slice(0,40),[feed.aircraft,feed.observations,airport,now]);
  const visibleAircraft=useMemo(()=>cameraTraffic.aircraft.filter(a=>(!hideStale||!staleAircraft(a,now))&&matchesTraffic(a,trafficFilter)&&matchesFilters(a,filters,filters.direction==='all'?undefined:movement(a,feed.histories.get(a.hex)??[],airport,now)?.direction)),[cameraTraffic.aircraft,trafficFilter,filters,airport,now,feed.histories,hideStale]);
  const [following,setFollowing] = useState(false);
  const [flightHost,setFlightHost]=useState<HTMLDivElement|null>(null);
  const [flightRequest,setFlightRequest]=useState<FlightRequest|null>(null),[discoveryNotice,setDiscoveryNotice]=useState('');
  const flightScene=useRef<FlightScene|null>(null),lastDiscovery=useRef(''),requestSerial=useRef(0);
  const rememberScene=useCallback((scene:FlightScene|null)=>{flightScene.current=scene;},[]);
  const [panel,setPanel] = useState<'aircraft'|'airport'|'none'>(shared.hasView?'airport':'none');
  const [command,setCommand] = useState<MapCommand>({action:'north',serial:0});
  const [replayPoints,setReplayPoints]=useState<TrailPoint[]>([]);
  const changeReplay=useCallback((n:number|null)=>{setSpotter(false);setFollowing(false);if(n!==null&&replayIndex===null)setReplayPoints(feed.trail.slice());setReplay(n);},[feed.trail,replayIndex]);
  const displayedTrail=replayIndex===null?feed.trail:replayPoints;
  const route = useFlightRoute(panel === 'aircraft' ? feed.selected : null);
  const arrivalGeometry=useArrivalGeometry(feed.selected,route.data);
  const [alertDestinations,setAlertDestinations]=useState(new Map<string,AlertDestination>());
  useEffect(()=>{const a=feed.selected,r=route.data;if(!a||r?.status!=='PLAUSIBLE'||r.airports.length!==2)return;const d=r.airports[1];setAlertDestinations(old=>{const next=new Map(old);next.delete(a.hex);next.set(a.hex,{id:d.iata||d.icao,lat:d.lat,lon:d.lon,callsign:a.callsign,loadedAt:Date.now()});if(next.size>50)next.delete(next.keys().next().value!);return next;});},[route.data,feed.selected?.hex,feed.selected?.callsign]);
  const interact = useCallback(() => {setFollowing(false);setSpotter(false);}, []);
  const navigation = (action: MapCommand['action']) => setCommand(c=>({action,serial:c.serial+1}));
  useEffect(() => { const id = setInterval(() => {if(!document.hidden)setNow(Date.now());}, 1000); return () => clearInterval(id); }, []);
  const geometryCache = useRef(new Map<string, GeometryFile>());
  useEffect(() => {
    const controller = new AbortController();
    setGeometryError(false);setGeometry(geometryCache.current.get(airport) ?? null);
    if (geometryCache.current.has(airport)) return;
    loadAirportGeometry(`${import.meta.env.BASE_URL}data/airports/${encodeURIComponent(airport)}.json`,airport,controller.signal)
      .then(a=>{if(controller.signal.aborted)return;const data={airports:[a]};geometryCache.current.set(airport,data);if(geometryCache.current.size>8)geometryCache.current.delete(geometryCache.current.keys().next().value!);setGeometry(data);})
      .catch(()=>{if(!controller.signal.aborted)setGeometryError(true);});
    return ()=>controller.abort();
  },[airport,geometryAttempt]);
  useEffect(()=>{if(!geometryError)return;const retry=()=>setGeometryAttempt(n=>n+1);window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[geometryError]);
  const select = useCallback((a: Aircraft) => { setGroundAnimation(false);setSpotter(false);setSession(null);setFlightRequest(null); initialIntent.current=false;feed.select(a);try{localStorage.setItem('skyward.last-flight.v1',JSON.stringify({hex:a.hex,label:a.callsign||a.registration||a.hex}));}catch{} setPanel('aircraft'); setFollowing(false); setReplay(null); setMobileOpen(false); setCamera(previous => ({ type: 'aircraft', serial: previous.serial + 1 })); }, [feed.select]);
  const watchFlight=(a:Aircraft,view='side')=>{select(a);setMode('3D');setExplore(false);setFlightRequest({hex:a.hex,view,serial:++requestSerial.current});};
  const discover=()=>{const candidate=interestingFlight(receivedAircraft,feed.histories,airport,trafficArea??AIRPORTS[airport],Date.now(),lastDiscovery.current);if(candidate){lastDiscovery.current=candidate.a.hex;watchFlight(candidate.a,candidate.view);setDiscoveryNotice(`${candidate.reason} · ${candidate.a.callsign||candidate.a.hex}`);}else{const center=trafficArea??AIRPORTS[airport],busy=busyObservedAirports(receivedAircraft,Date.now()).find(x=>distanceNm(center.lat,center.lon,x.airport.lat,x.airport.lon)<=150),id=busy?.id??airport;focusAirport(id);setMode('3D');setCamera(c=>({type:'tower',airport:id,serial:c.serial+1}));setDiscoveryNotice(busy?`${id} tower · ${busy.count} recently observed aircraft nearby`:`Waiting for recent traffic near ${id}. Try again after positions arrive.`);}};
  const lookup = useCallback(async (kind: string, query: string) => { const a = await feed.lookup(kind, query); if (a) { setSpotter(false);setSession(null);setPanel('aircraft'); setFollowing(false); setReplay(null); setMobileOpen(false); setCamera(previous => ({ type: 'aircraft', serial: previous.serial + 1 })); } return a; }, [feed.lookup]);
  const focusAirport = (id: AirportId) => {setGroundAnimation(false);setSpotter(false);setSession(null); initialIntent.current=false; setPanel('airport');setFollowing(false);feed.clearSelected();setWatching(false);setAirport(id); setReplay(null); setMobileOpen(false); setCamera(previous => ({ type: 'airport', airport: id, serial: previous.serial + 1 })); };
  const focusFacility = (facility: FacilityTarget) => {setSpotter(false);setSession(null);initialIntent.current=false;setAirport(facility.airport);setPanel('airport');setFollowing(false);feed.clearSelected();setCamera(previous=>({type:'facility',airport:facility.airport,facility,serial:previous.serial+1}));};
  const resetCamera=()=>{closeDetails();setReplay(null);setMobileOpen(false);setMode('3D');focusWorld();};
  const focusWorld = () => {setGroundAnimation(false);setSpotter(false);setSession(null); initialIntent.current=false; setFollowing(false);setCamera(previous => ({ type: 'world', serial: previous.serial + 1 })); };
  const focusAircraft = () => {setSpotter(false);if(following){setFollowing(false);return;}setFollowing(true);setCamera(previous => ({ type: 'aircraft', serial: previous.serial + 1 })); };
  const fullRoute=()=>{setSpotter(false);setFollowing(false);setReplay(null);setCamera(c=>({type:'route',serial:c.serial+1}));};
  const tower=()=>{setGroundAnimation(false);setSpotter(false);setSession(null);setMode('3D');setFollowing(false);feed.clearSelected();setReplay(null);setCamera(c=>({type:'tower',airport,serial:c.serial+1}));};
  const airport3D=()=>{const g=geometry?.airports.find(a=>a.id===airport);if(!g)return;setGroundAnimation(false);setReplay(null);setMode('3D');setPreferences(p=>({...p,structures:true}));focusFacility(airport3DTarget(g));};
  const overview=()=>{setSpotter(false);setPanel('airport');setFollowing(false);feed.clearSelected();setReplay(null);setCamera(c=>({type:'overview',airport,serial:c.serial+1}));};
  const closeDetails = () => {setSpotter(false);setSession(null);setPanel('none');setFollowing(false);feed.clearSelected();};
  useEffect(()=>{
    if(!initialIntent.current)return;
    const requestedCallsign=new URLSearchParams(location.search).get('flight');
    if(requestedCallsign&&/^[A-Z0-9]{2,10}$/i.test(requestedCallsign)){initialIntent.current=false;void lookup('callsign',requestedCallsign.toUpperCase());return;}
    if(shared.aircraft){initialIntent.current=false;void lookup('hex',shared.aircraft).then(a=>{if(a&&shared.sceneView)setFlightRequest({hex:a.hex,view:shared.sceneView,serial:++requestSerial.current});if(shared.camera){setRecoveryPose(shared.camera);setReady(false);setGlobeKey(n=>n+1);}});return;}
    if(shared.facility){if(!geometry||!geometry.airports.some(a=>a.id===shared.airport))return;initialIntent.current=false;const f=airportFacilities(geometry.airports.find(a=>a.id===shared.airport)).find(f=>f.id===shared.facility);if(f)focusFacility(f);if(shared.camera){setRecoveryPose(shared.camera);setReady(false);setGlobeKey(n=>n+1);}}
    else initialIntent.current=false;
  },[geometry,shared,lookup]);
  const runways = useMemo(() => geometry?.airports.flatMap(a => a.runways) ?? [], [geometry]);
  useEffect(() => {
    const stage=mapStage.current, inspector=stage?.querySelector<HTMLElement>('.inspector');
    if(!stage)return;if(!inspector){stage.style.setProperty('--inspector-space','0px');return;}
    const size=()=>stage.style.setProperty('--inspector-space',`${Math.min(inspector.offsetHeight+42,Math.max(0,stage.clientHeight-220))}px`);
    const observer=new ResizeObserver(size);observer.observe(inspector);observer.observe(stage);size();
    return()=>observer.disconnect();
  },[panel,feed.selected?.hex,airport,groundAnimation]);
  const utc = new Date(now).toISOString().slice(11, 19);
  return <RouteSettings viewAirport={a=>{const id=Object.keys(AIRPORTS).find(id=>id===a.iata||AIRPORTS[id].icao===a.icao);if(id)focusAirport(id);else {setSpotter(false);setFollowing(false);setSession(null);setCamera(c=>({type:'point',serial:c.serial+1,facility:{airport,lon:a.lon,lat:a.lat,label:a.name,range:15000}}));}}}><div className={`app-shell ${focusMode?'focus-mode':''} ${session?'session-view':''} ${preferences.reducedMotion?'reduced-motion':''} ${preferences.largeLabels?'large-labels':''} ${preferences.highContrast?'high-contrast':''}`}><a className="skip-link" href="#map">Skip to map</a>
    <header className="topbar"><div className="brand"><button className="mobile-menu icon-button" aria-label="Open aircraft browser" aria-expanded={mobileOpen} aria-controls="aircraft-browser" onClick={() => {setSession(null);setMobileOpen(!mobileOpen);}}><Menu size={21}/></button><Compass size={34} strokeWidth={1}/><span className="brand-name">SKYWARD</span><span className="brand-description">{session?'Session replay':'Flight observatory'}</span></div><nav aria-label="Primary navigation"><button className={!watching&&!session ? 'active' : ''} onClick={() => {setSession(null);setSpotter(false); setWatching(false); if (innerWidth < 760) setMobileOpen(true); }}><i className="status-dot"/>Live airspace</button><button className={watching ? 'active' : ''} onClick={() => {setSession(null);setSpotter(false); setWatching(true); if (innerWidth < 760) setMobileOpen(true); }}><Star size={16}/>Watching{feed.watches.length > 0 && <span className="watch-count">{feed.watches.length}</span>}</button></nav><div className="header-status"><time><span>UTC</span> {session?new Date(sessionTime).toISOString().slice(11,19):utc}</time><span className="connection-status"><i className={`status-dot ${cameraTraffic.error ? 'amber' : ''}`}/>{session?'Recorded observations':!offline.online?'Offline · retained positions':cameraTraffic.error?(cameraTraffic.loading?'Reconnecting…':`Retry in ${Math.max(0,Math.ceil(((cameraTraffic.nextAttemptAt??now)-now)/1000))}s`):cameraTraffic.loading?'Updating traffic':'Feed connected'}</span></div></header>
    <div className="workspace"><div id="aircraft-browser" className={`sidebar-shell ${mobileOpen ? 'open' : ''}`}><button className="mobile-close icon-button" aria-label="Close aircraft browser" onClick={() => setMobileOpen(false)}><X size={20}/></button><Sidebar filters={filters} setFilters={setFilters} allAircraft={cameraTraffic.aircraft} scope={areaDescription} trafficFilter={trafficFilter} setTrafficFilter={setTrafficFilter} airport={airport} setAirport={focusAirport} focusAirport={focusAirport} aircraft={visibleAircraft} selected={feed.selected} select={select} watches={feed.watches} watching={watching} lookup={lookup} searching={feed.searching} searchError={feed.searchError} error={cameraTraffic.error} loading={cameraTraffic.loading} now={now} updatedAt={cameraTraffic.updatedAt} refresh={cameraTraffic.refresh}/></div>{mobileOpen && <button className="sidebar-backdrop" aria-label="Close aircraft browser" onClick={() => setMobileOpen(false)}/>}
    <main tabIndex={-1} id="map" className="map-stage" ref={mapStage}><Suspense fallback={<div className="tool-loading" role="status">Loading globe…</div>}><Globe flightHost={flightHost} flightRequest={flightRequest} onFlightScene={rememberScene} groundObservations={receivedAircraft} groundAnimation={groundAnimation&&!session} closeGround={()=>setGroundAnimation(false)} onViewer={onViewer} arrivalGeometry={arrivalGeometry} exitRoute={()=>{setFollowing(false);setCamera(c=>({type:'aircraft',serial:c.serial+1}));}} toolsHost={toolsHost} key={globeKey} recoveryPose={recoveryPose} recover={recoverGlobe} obscured={explore||about||help||searchOpen} automatic={automatic} spotterMode={spotter?spotterMode:null} spotterPaused={spotterPaused||explore||about||help||searchOpen} bookmarkRestore={b=>{setCamera(c=>({type:'world',serial:c.serial+1}));setSpotter(false);setFollowing(false);setMode(b.mode);setPreferences(p=>({...p,...b.layers}));setRecoveryPose(b.pose);setReady(false);setGlobeKey(n=>n+1);}} density={density&&!session?cells:null} playback={session?{recording:session,time:sessionTime}:null} feedHealth={{error:cameraTraffic.error,updatedAt:cameraTraffic.updatedAt}} onAutomaticQuality={setAutomatic} histories={feed.motionHistories} onTrafficArea={setTrafficArea} movements={showMovements&&replayIndex===null?movements:[]} preferences={effectivePreferences} aircraft={visibleAircraft} selected={feed.selected} select={select} mode={mode} camera={camera} trail={displayedTrail} replayIndex={replayIndex} geometry={geometry} now={now} zoomSignal={zoom} following={following} onInteract={interact} onAirport={focusAirport} onFacility={focusFacility} command={command} route={route.data} onReady={() => setReady(true)}/></Suspense>
      <div className="map-title"><div className="map-title-heading"><h1>{camera.type==='night'?'City lights · Earth at night':camera.type==='point'?camera.facility?.label:viewingElsewhere?`Exploring ${cameraPlace||'camera area'}`:(camera.type === 'airport' || camera.type === 'tower' || camera.type === 'overview' || camera.type === 'facility') ? AIRPORTS[camera.airport!].name : (camera.type === 'aircraft'||camera.type==='route') && feed.selected ? feed.selected.callsign || feed.selected.registration || 'Aircraft details' : 'A world in motion.'}</h1><div ref={setFlightHost} className="flight-launch-slot"/></div>{!viewingElsewhere&&(camera.type==='aircraft'||camera.type==='route')&&feed.selected&&<span className="map-flight-route" aria-label="Flight route">{flightHeaderRoute(feed.selected,route.data)}</span>}<p>{viewingElsewhere?areaDescription:(camera.type === 'airport' || camera.type === 'tower' || camera.type === 'overview' || camera.type === 'facility') ? `${camera.airport} · ${camera.facility?.label ?? 'Airport map & reported traffic'}` : areaDescription}</p><p className="camera-state">{camera.type==='tower'?'Virtual tower · drag to look around':following ? 'Following aircraft · drag to release' : 'Free camera · drag to spin · right-drag to tilt · scroll / pinch to zoom'}</p></div>
      <div className="map-primary-controls" role="group" aria-label="Map display controls"><button className="focus-toggle" aria-pressed={focusMode} onClick={()=>{setFocusMode(v=>!v);setMobileOpen(false);}}>{focusMode?'Restore panels':'Focus mode'}</button><button className="camera-reset" onClick={resetCamera} title="Return to a north-up globe">Reset view</button><button className="camera-tilt" disabled={mode==='2D'} onClick={()=>navigation('tilt')} title="Switch overhead / angled view · right-drag or Ctrl-drag to adjust freely">View angle</button><MapTools host={setToolsHost}><div className="map-mode segmented" aria-label="Map view"><MapToolAction description="Explore the Earth in 3D." className={mode === '3D' ? 'active' : ''} aria-pressed={mode === '3D'} onClick={() => setMode('3D')}><Globe2 size={17}/>3D globe</MapToolAction><MapToolAction description="View a flat map from above." className={mode === '2D' ? 'active' : ''} aria-pressed={mode === '2D'} onClick={() => setMode('2D')}><MapIcon size={17}/>2D map</MapToolAction></div><MapToolAction description="Face Earth's current night side and glowing cities · historical night imagery." onClick={()=>{closeDetails();setReplay(null);setMobileOpen(false);setMode('3D');setCamera(c=>({type:'night',serial:c.serial+1}));}}>City lights globe</MapToolAction>
      <MapLayers value={preferences} change={setPreferences}/>
      <div className="map-tools"><MapToolAction description="Move closer to the map." className="icon-button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => z + 1)}><Plus size={19}/></MapToolAction><MapToolAction description="See a wider area." className="icon-button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => z - 1)}><Minus size={19}/></MapToolAction><MapToolAction description="Fit the whole world in view." className="icon-button" title="Show world" aria-label="Show world" onClick={focusWorld}><Crosshair size={19}/></MapToolAction><MapToolAction description="Turn the view to the left." className="icon-button" aria-label="Rotate globe left" title="Rotate left" onClick={()=>navigation('left')}><RotateCcw size={18}/></MapToolAction><MapToolAction description="Turn the view to the right." className="icon-button" aria-label="Rotate globe right" title="Rotate right" onClick={()=>navigation('right')}><RotateCw size={18}/></MapToolAction><MapToolAction description="Point the map north." className="icon-button" aria-label="Reset north" title="North up" onClick={()=>navigation('north')}><Compass size={18}/></MapToolAction><MapToolAction description="Switch between overhead and angled views. Available in 3D." className="icon-button" aria-label="Toggle overhead or tilted view" title="Toggle overhead / tilt (also right-drag)" disabled={mode==='2D'} onClick={()=>navigation('tilt')}><Orbit size={18}/></MapToolAction><MapToolAction description="Replay the short introduction." onClick={()=>setGuide(true)}>Getting started</MapToolAction><MapToolAction description="See mouse, touch and keyboard controls." className="icon-button" aria-label="Map controls and help" title="Map controls and help" onClick={()=>setHelp(true)}><CircleHelp size={18}/></MapToolAction></div>
      <label className="stale-toggle"><input type="checkbox" checked={hideStale} onChange={e=>setHideStale(e.target.checked)}/>Hide stale aircraft (over 2 minutes / unknown time)</label><small>Selected aircraft stays visible. Violet: estimated movement; amber: stale or unavailable motion data. Predicted motion can continue during feed gaps. A displayed touchdown is not a confirmed arrival.</small></MapTools></div>
      <p className="discovery-feedback" role="status">{discoveryNotice}</p>{ready&&<CoverageStatus suggestions={<NearbyTraffic rows={receivedAircraft} center={trafficArea??AIRPORTS[airport]} now={now} select={select}/>} rows={cameraTraffic.aircraft} now={now} {...cameraTraffic} limited={trafficArea?.limited??false} description={areaDescription} shown={visibleAircraft.length} clear={(trafficFilter!=='all'||filtersActive(filters)||hideStale)?()=>{setTrafficFilter('all');setFilters({...emptyFilters});setHideStale(false);}:undefined}/>}
      {!ready && <div className="globe-loading"><span className="loading-ring"/>Opening the observatory…</div>}
      {shared.aircraft&&feed.searchError&&<p className="shared-error" role="status">Shared aircraft: {feed.searchError}</p>}
      {(trafficFilter!=='all'||filtersActive(filters)||hideStale)&&<p className="active-filter">Traffic filter active · selected aircraft stays visible</p>}
      {feed.watchSyncError&&<p className="watch-sync-error" role="status">Watchlist: {feed.watchSyncError}</p>}
      {geometryError && <p className="geometry-error" role="status">Airport map unavailable. Check connection health for live traffic. <button className="text-button" onClick={()=>setGeometryAttempt(n=>n+1)}>Retry airport map</button></p>}

      {!groundAnimation&&(panel === 'airport' ? <AirportInspector observations={feed.observations} retryGeometry={()=>setGeometryAttempt(n=>n+1)} histories={feed.histories} board={()=>openTools('board')} tower={tower} airport3D={airport3D} overview={overview} geometryError={geometryError} selected={camera.type==='facility'?camera.facility:undefined} key={airport} airport={airport} geometry={geometry?.airports.find(a=>a.id===airport)} aircraft={feed.aircraft} now={now} updatedAt={feed.updatedAt} loading={feed.loading} error={feed.error} refresh={feed.refresh} focus={focusFacility} select={select} close={closeDetails}/> : <Inspector compare={()=>openTools('compare')} quality={effectivePreferences.quality} feedHealth={{error:cameraTraffic.error,updatedAt:cameraTraffic.updatedAt}} reducedMotion={preferences.reducedMotion} fullRoute={fullRoute} aircraft={feed.selected} now={now} watched={feed.watches.some(w => w.hex === feed.selected?.hex)} toggleWatch={() => feed.selected && feed.toggleWatch(feed.selected)} focus={focusAircraft} trail={displayedTrail} error={feed.selectedError} runways={runways} replayIndex={replayIndex} setReplay={changeReplay} route={route.data} routeLoading={route.loading} routeError={route.error} following={following} close={closeDetails}/>)}
    </main></div>
    {spotter&&!session&&<Spotter key={airport} airport={airport} rows={receivedAircraft} histories={feed.motionHistories} now={now} paused={explore||about||help||searchOpen} cameraMode={spotterMode} hasRunway={!!geometry?.airports.find(a=>a.id===airport)?.runways.length} userPaused={spotterPaused} setUserPaused={v=>{setSpotterPaused(v);setFollowing(!v&&spotterMode==='follow');if(!v&&spotterMode==='follow')setCamera(c=>({type:'aircraft',serial:c.serial+1}));}} setCameraMode={m=>{setSpotterMode(m);setFollowing(m==='follow'&&!spotterPaused);if(m==='follow')setCamera(c=>({type:'aircraft',serial:c.serial+1}));}} select={a=>{feed.select(a);setPanel('aircraft');setFollowing(spotterMode==='follow');if(spotterMode==='follow')setCamera(c=>({type:'aircraft',serial:c.serial+1}));}} stop={()=>{setSpotter(false);setFollowing(false);}}/>}
    {session&&<SessionReplayControls recording={session} time={sessionTime} change={setSessionTime} paused={explore||about||help||searchOpen||!ready} close={()=>setSession(null)}/>}
    <footer className={`statusbar ${mobileMore?'mobile-more-open':''}`}><button className="mobile-flights quiet-button" onClick={()=>{setFocusMode(false);setMobileMore(false);setMobileOpen(v=>!v);}}>Flights</button><button className="mobile-more quiet-button" aria-expanded={mobileMore} onClick={()=>setMobileMore(v=>!v)}>{mobileMore?'Less':'More'}</button><TripFollower rows={receivedAircraft} watch={watchFlight} onOpen={setSearchOpen}/><QuickSearch lookup={async id=>{const a=await lookup('hex',id);if(!a)throw Error('No current observation found for this saved aircraft.');}} onOpen={setSearchOpen} rows={receivedAircraft} select={select} airport={focusAirport} actions={[{name:'World view',run:focusWorld},{name:'Sessions',run:()=>openTools('session')},{name:'Model gallery',run:()=>openTools('gallery')},{name:'Favorites',run:()=>openTools('collections')},{name:'Airport spotter',run:()=>openTools('spotter')},{name:'Device settings',run:()=>openTools('reliability')}]}/><button className={`quiet-button ${recorder.recording?'recording-active':''}`} onClick={()=>openTools('session')}>{recorder.recording?'● Recording':'Record session'}</button><button className="quiet-button discover-trigger" onClick={discover}>Watch something interesting</button><button className="quiet-button dashboard-trigger" onClick={()=>openTools('dashboard')}>My flights</button><button className="quiet-button explore-trigger" onClick={()=>openTools('discover')}>Explore tools</button><FeedHealth area={trafficArea} traffic={{...cameraTraffic,count:cameraTraffic.aircraft.length}}/><WatchAlerts destinations={alertDestinations} watches={feed.watches} observations={feed.observations} now={now} enabled={alertsEnabled} setEnabled={setAlertsEnabled}/><a className="simulation-link" href="/airport-simulation/">Airport simulator · Premium ↗</a><a className="simulation-link" href="/flight-simulator/">Fly an aircraft · Premium ↗</a><Upgrade openJourney={async hex=>{const a=await lookup('hex',hex);if(!a)throw Error('No current observation found for this aircraft.');select(a);}}/><ShareView getFlightScene={()=>flightScene.current} getViewer={()=>sharedViewer.current} airport={airport} hex={feed.selected?.hex} facility={camera.facility?.id} mode={mode}/><a className="quiet-button" href="/airports/">Airport directory</a><div><button className="quiet-button" onClick={() => setAbout(true)}><Info size={14}/>About the data</button></div></footer>
    <footer id="map-attribution" className="map-attribution" aria-label="Map attribution"/>
    {showMovements&&replayIndex===null&&<p className="movement-legend">Approach / departure candidates · blue solid = approaching · orange dashed = moving away · inferred</p>}
    {explore&&<Suspense fallback={<div className="tool-loading" role="status">Loading exploration tools…</div>}><ExploreTools watchFlight={watchFlight} captureCamera={()=>cameraSnapshot(sharedViewer.current)} startGround={()=>{setGroundAnimation(true);setSession(null);setSpotter(false);setFollowing(false);setMode('3D');setExplore(false);overview();setPanel('none');}} watches={feed.watches} toggleWatch={feed.toggleWatch} alertsEnabled={alertsEnabled} setAlertsEnabled={setAlertsEnabled} recorder={recorder} playSession={playSession} density={density} setDensity={setDensity} startSpotter={()=>{setGroundAnimation(false);setSession(null);setReplay(null);setSpotter(true);setSpotterPaused(false);setFollowing(false);setMode('3D');setExplore(false);}} initialTab={exploreTab} center={trafficArea??AIRPORTS[airport]} airportRows={feed.aircraft} airportError={feed.error} lookup={hex=>feed.lookup('hex',hex)} replay={(a,index)=>{select(a);setReplayPoints([...(feed.histories.get(a.hex)??[])]);setReplay(index);}} offline={offline} automatic={automatic} restore={()=>setAutomatic(null)} airport={airport} geometry={geometry?.airports.find(a=>a.id===airport)} close={()=>setExplore(false)} focusAirport={focusAirport} overview={overview} focusFacility={focusFacility} activity={feed.activity[airport]??[]} now={now} movements={movements} showMovements={showMovements} setShowMovements={setShowMovements} observations={feed.observations} histories={feed.histories} selected={feed.selected} ingest={feed.ingest} select={select} preferences={preferences} setPreferences={setPreferences}/></Suspense>}
    {(!offline.online||automatic)&&<div className="device-notice" role="status">{!offline.online?'Offline · showing cached Atlas assets; new traffic unavailable.':`Graphics reduced to ${automatic} for this session.`}<button onClick={()=>openTools('reliability')}>Device settings</button></div>}
    {help && <Suspense fallback={<div role="status">Loading help…</div>}><ControlsHelp close={()=>setHelp(false)}/></Suspense>}
    {ready&&guide&&<WelcomeGuide close={closeGuide}/>}
    {about && <Suspense fallback={<div role="status">Loading data information…</div>}><AboutData close={() => setAbout(false)}/></Suspense>}
  </div></RouteSettings>;
}
