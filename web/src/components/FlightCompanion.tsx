import {nearbyFeatures} from '../lib/nearbyFeatures';
import {reportDistanceKm} from '../lib/localWeather';
import {useEffect,useMemo,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft,AirportGeometry,FlightRoute,TrailPoint} from '../types';
import {nearestCity,type City} from '../lib/cities';
import {sharedLiveMotion} from '../lib/liveMotion';
import {coverageLabel,descentHighlight,retainedFixes} from '../lib/flightCompanion';
import {countryAt} from '../lib/passengerGeography';
import {readFlightPreferences,saveFlightPreferences} from '../lib/flightPreferences';
import {geography} from './PassengerGeography';
import {ReplayTimeline} from './ReplayTimeline';
import {FlightMiniMap} from './FlightMiniMap';
import {DestinationContext} from './DestinationContext';
import {weatherSummary,type LocalWeather} from '../lib/localWeather';
import './flight-companion.css';

export function FlightCompanion({aircraft:a,trail,cities,route,geometry,viewer}:{aircraft:Aircraft;trail:TrailPoint[];cities:City[];route:FlightRoute|null;geometry:AirportGeometry|null;viewer:Cesium.Viewer|null}){
 const [now,setNow]=useState(Date.now),[enabled,setEnabled]=useState(()=>readFlightPreferences().highlights),[density,setDensity]=useState(()=>readFlightPreferences().labelDensity);
 const [geoFailed,setGeoFailed]=useState(false);
 const [geo,setGeo]=useState<Awaited<ReturnType<typeof geography>>|null>(null),[notice,setNotice]=useState(''),[index,setIndex]=useState<number|null>(null),[snapshot,setSnapshot]=useState<TrailPoint[]>([]);
 const previous=useRef({country:'',city:'',descending:false,lastNotice:0});
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setNow(Date.now());},1000);let active=true;geography().then(d=>{if(active)setGeo(d);}).catch(()=>{if(active)setGeoFailed(true);});return()=>{active=false;clearInterval(timer);};},[]);
 const frame=sharedLiveMotion.displayed(a.hex),position=frame?{...a,lat:frame.lat,lon:frame.lon,heading:frame.heading}:a;
 const city=useMemo(()=>position.lon!==null&&position.lat!==null?nearestCity(cities,position.lon,position.lat):null,[cities,position.lat,position.lon]);
 const country=useMemo(()=>geo&&position.lon!==null&&position.lat!==null?countryAt(geo.countries,position.lon,position.lat):null,[geo,position.lat,position.lon]);
 const descending=useMemo(()=>descentHighlight(trail),[trail]);
 useEffect(()=>{const last=previous.current;let text='';if(enabled){if(country?.name&&last.country&&country.name!==last.country)text=`Now over ${country.name} · approximate mapped boundary`;else if(city&&city.km<30&&last.city!==city.city.name)text=`Passing near ${city.city.name}`;else if(descending&&!last.descending)text=a.simulation?'Simulated descent':'Descent observed in recent positions';if(text&&now-last.lastNotice>60000){setNotice(text);last.lastNotice=now;}}last.country=country?.name??'';last.city=city?.km!==undefined&&city.km<30?city.city.name:'';last.descending=descending;},[enabled,country?.name,city?.city.name,city?.km,descending,now,a.simulation]);
 const features=position.lat!==null&&position.lon!==null?nearbyFeatures().map(f=>({...f,distance:reportDistanceKm(f,{lat:position.lat!,lon:position.lon!})})).filter(f=>f.distance<100).sort((a,b)=>a.distance-b.distance).filter((f,i,list)=>list.findIndex(v=>v.name===f.name)===i).slice(0,4):[];
 const points=useMemo(()=>retainedFixes(trail),[trail]),fix=index===null?null:snapshot[Math.min(index,snapshot.length-1)];
 let elevation:number|undefined;if(viewer&&!viewer.isDestroyed()&&position.lon!==null&&position.lat!==null)elevation=viewer.scene.globe.getHeight(window.Cesium.Cartographic.fromDegrees(position.lon,position.lat));
 return <section className="flight-companion" aria-label="Journey companion">
 <p className="coverage-pill" role="status">{coverageLabel(a,now,!!frame?.arrivalAnimation)}</p>
 <details open><summary>What’s below?</summary><strong>{city?`${city.km} km ${city.direction} of ${city.city.name}`:'Away from reference cities'}</strong><p>{country?.name??(geo?'Over water or outside mapped land':geoFailed?'Geography unavailable':'Geography loading…')}{typeof elevation==='number'&&Number.isFinite(elevation)?` · terrain ${Math.round(elevation).toLocaleString()} m above sea level`:''}</p>{features.length>0&&<ul>{features.map(f=><li key={f.name}>{f.name} · {f.kind} · {Math.round(f.distance)} km away</li>)}</ul>}<small>Based on the displayed position. Terrain and country boundaries are approximate; nearby features may be hidden by clouds.</small></details>
 <details><summary>Viewing preferences</summary><label>Ground label density <select aria-label="Ground label density" value={density} onChange={e=>{setDensity(e.target.value);saveFlightPreferences({labelDensity:e.target.value});}}><option value="sparse">Sparse</option><option value="normal">Normal</option><option value="rich">Rich</option></select></label><label><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);setNotice('');saveFlightPreferences({highlights:e.target.checked});}}/>Journey highlights</label><small>Camera, window seat, shade, map zoom and label density are remembered on this device. Sound uses its existing saved controls.</small></details>
 {enabled&&notice&&<div className="journey-notice" role="status">{notice}<button aria-label="Dismiss journey highlight" onClick={()=>setNotice('')}>×</button></div>}
 <ArrivalPreview aircraft={a} route={route} geometry={geometry} now={now}/>
 <details><summary>Revisit this flight · {points.length} retained fixes</summary><p>Inspect the retained track on this map while the 3D flight continues. Missing portions are not reconstructed.</p>{index===null?<button disabled={points.length<2||!!a.simulation} onClick={()=>{setSnapshot(points);setIndex(0);}}>Review observations</button>:<><strong>Historical observation · not current</strong><button onClick={()=>{setIndex(null);setSnapshot([]);}}>Return to current position</button>{fix&&<FlightMiniMap aircraft={{...a,...fix,heading:null,observedAt:fix.time}} cities={cities} route={route} trail={snapshot.slice(0,index+1)} positionLabel={`Retained fix · ${new Date(fix.time).toISOString().slice(11,19)} UTC`}/>}<ReplayTimeline points={snapshot} index={index} change={setIndex}/></>}{a.simulation&&<small>Fictional traffic has no real observations to replay.</small>}</details>
 </section>;
}
function ArrivalPreview({aircraft,route,geometry,now}:{aircraft:Aircraft;route:FlightRoute|null;geometry:AirportGeometry|null;now:number}){
 const [open,setOpen]=useState(false),[weather,setWeather]=useState<LocalWeather|null>(null),[failed,setFailed]=useState(false);
 const destination=route?.callsign===aircraft.callsign&&route.status==='PLAUSIBLE'&&route.airports.length===2?route.airports[1]:null;
 useEffect(()=>{setWeather(null);setFailed(false);if(!open||!destination)return;const abort=new AbortController();fetch(`/api/local-weather?lat=${destination.lat.toFixed(4)}&lon=${destination.lon.toFixed(4)}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!abort.signal.aborted)setWeather(d);}).catch(()=>{if(!abort.signal.aborted)setFailed(true);});return()=>abort.abort();},[open,destination?.lat,destination?.lon]);
 if(!destination)return <details><summary>Arrival preview</summary><p>A verified destination is not available for this flight.</p></details>;
 const mapped=geometry&&[destination.iata,destination.icao].includes(geometry.id)?geometry:null;
 const report=weather?.report;
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Arrival preview · {destination.iata||destination.icao}</summary><DestinationContext aircraft={aircraft} route={route} now={now}/><p>{report?`${weatherSummary(report)} · ${report.station} · reported ${new Date(report.observedAt).toISOString().slice(11,16)} UTC${now-report.observedAt>3600000?' · older report':''}`:failed||weather?'Destination weather unavailable':open?'Loading destination weather…':'Open to load weather'}</p>{report&&<p>Wind {report.windKnots??'—'} kt · visibility {report.visibilityKm??'—'} km · report {Math.round(report.distanceKm)} km from airport. Surface conditions, not approach clearance.</p>}{mapped?<><p>{mapped.name} · {mapped.runways.length} mapped runways · {mapped.gates.length} mapped stands</p><p>Runways: {mapped.runways.map(r=>r.id).join(', ')||'Unavailable'}</p><small>No runway or gate assignment is implied. Layout coverage may be incomplete.</small></>:<p>Destination layout is not loaded yet.</p>}</details>;
}
