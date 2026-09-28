import {useEffect,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft,AirportGeometry,TrailPoint,FlightRoute} from '../types';
import {liveFrame,predictionConfidence} from '../lib/liveMotion';
import {trackDistance} from '../lib/positionQuality';
export function PredictionDetails({aircraft:a,points,viewer,reduced,route,arrivalGeometry}:{aircraft:Aircraft;points:TrailPoint[];viewer:Cesium.Viewer|null;reduced:boolean;route?:FlightRoute|null;arrivalGeometry?:AirportGeometry|null}){
 const [now,setNow]=useState(Date.now),[recovered,setRecovered]=useState<number|null>(null),previous=useRef({hex:a.hex,time:a.observedAt});
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const old=previous.current;if(old.hex===a.hex&&old.time!==null&&a.observedAt!==null&&a.observedAt>old.time&&Date.now()-old.time>60000)setRecovered(Date.now());else if(old.hex!==a.hex)setRecovered(null);previous.current={hex:a.hex,time:a.observedAt};},[a.hex,a.observedAt]);
 const prediction=liveFrame(a,points,now,reduced,route,arrivalGeometry),confidence=predictionConfidence(a,now);
 let shown=prediction;
 if(viewer&&!viewer.isDestroyed()){const pos=viewer.entities.getById(`aircraft-${a.hex}`)?.position?.getValue(viewer.clock.currentTime);if(pos&&prediction){const C=window.Cesium,c=C.Cartographic.fromCartesian(pos);shown={...prediction,lat:C.Math.toDegrees(c.latitude),lon:C.Math.toDegrees(c.longitude),altitude:prediction.landingPhase?prediction.altitude:Math.max(0,(c.height-5)/.3048)};}}
 const offset=shown&&a.lat!==null&&a.lon!==null?trackDistance(shown,{lat:a.lat,lon:a.lon}):null;
 return <details className="prediction-details" aria-label="Position details"><summary>Position &amp; prediction details</summary>
 {recovered&&now-recovered<12000&&<p className="prediction-recovery" role="status">{now-recovered<2000?'Observations resumed · correcting displayed position…':'Observations resumed · position updated'}</p>}
 <strong>{prediction?.landingPhase?'Predicted landing · not a confirmed arrival':prediction?.predictionLimited?(prediction.ground?'On ground · awaiting position update':'Extended predicted motion · arrival unconfirmed'):prediction?.estimated?confidence.level:'Observed position'}</strong>
 <p>Last fix: {Number.isFinite(confidence.age)?`${Math.floor(confidence.age)}s ago`:'unavailable'}{prediction?.estimated&&confidence.driftNm!==null?` · illustrative drift allowance ~${confidence.driftNm.toFixed(1)} nm`:''}</p>
 <dl><dt>{prediction?.estimated?'Displayed estimate':'Displayed position'}</dt><dd>{shown?`${shown.lat.toFixed(3)}°, ${shown.lon.toFixed(3)}° · ${Math.round(shown.altitude).toLocaleString()} ft`:'Unavailable'}</dd><dt>Last confirmed fix</dt><dd>{a.lat?.toFixed(3)??'—'}°, {a.lon?.toFixed(3)??'—'}° · {a.altitude?.toLocaleString()??'—'} ft</dd></dl>
 {offset!==null&&<p>{offset.toFixed(1)} nm from the last confirmed fix.</p>}
 <small>Predicted landings use mapped runway alignment and field elevation. Touchdown and rollout are illustrative; fresh fixes override them. Mapped taxi paths may lead to an illustrative stand; gate assignments and arrivals remain unconfirmed. Drift allowance is an age-and-speed heuristic, not a measured error or guaranteed bound. Turn and vertical-speed trends fade out over 30 seconds; motion continues through feed gaps, but the model cannot know unreported maneuvers.</small>
 </details>;
}
