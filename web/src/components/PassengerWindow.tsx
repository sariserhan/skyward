import {fleetProfile,profileNames,sourcedModel} from '../lib/flightPresentation';
import {readFlightPreferences,saveFlightPreferences} from '../lib/flightPreferences';
import {useEffect,useState} from 'react';
import type * as Cesium from 'cesium';
import {solarElevation,sunDirectionFixed} from '../lib/solarLighting';
export function PassengerWindow({aircraftType,viewer,side,changeSide,seat,changeSeat,look,changeLook,exit}:{aircraftType:string;viewer:Cesium.Viewer;side:'left'|'right';changeSide:(side:'left'|'right')=>void;seat:number;changeSeat:(seat:number)=>void;look:number;changeLook:(look:number)=>void;exit:()=>void}){
 const [shade,setShade]=useState(()=>readFlightPreferences().shade),[night,setNight]=useState(false);
 useEffect(()=>{saveFlightPreferences({shade});},[shade]);
 useEffect(()=>{const update=()=>{if(document.hidden||viewer.isDestroyed())return;const C=window.Cesium;setNight(solarElevation(C,viewer.camera.positionWC,sunDirectionFixed(C,viewer.clock.currentTime))<-3);};update();const timer=setInterval(update,5000);return()=>clearInterval(timer);},[viewer]);
 const profile=fleetProfile(aircraftType),small=['light','bizjet','pc12'].includes(profile),label=sourcedModel(aircraftType)?.label??profileNames[profile];
 return <section className={`passenger-window-view${small?' passenger-window-small':''}${night?' passenger-window-night':''}`} aria-label="Passenger window view">
  <div className="passenger-window-frame" aria-hidden="true"><div className="passenger-window-glass"/><div className="passenger-window-shade" style={{height:`${shade}%`}}><span/></div><div className="passenger-window-rim"/></div>
  <div className="passenger-window-controls"><strong>{label} · window seat</strong><small>Approximate seat framing scaled to the airframe; not a verified cabin interior.</small><div role="group" aria-label="Passenger window side"><button aria-pressed={side==='left'} onClick={()=>changeSide('left')}>Left window</button><button aria-pressed={side==='right'} onClick={()=>changeSide('right')}>Right window</button></div><label>Seat<select aria-label="Window seat position" value={seat} onChange={e=>changeSeat(Number(e.target.value))}><option value={.2}>Ahead of wing</option><option value={-.06}>Over wing</option><option value={-.28}>Behind wing</option></select></label><label>Look<input aria-label="Window look around" type="range" min="-35" max="35" value={look} onChange={e=>changeLook(Number(e.target.value))}/></label><button onClick={()=>changeLook(0)}>Center look</button><label>Shade<input aria-label="Window shade" type="range" min="0" max="100" step="5" value={shade} onChange={e=>setShade(Number(e.target.value))}/><output>{shade===0?'Open':shade===100?'Closed':`${shade}%`}</output></label><button onClick={exit}>Exit window view</button></div>
 </section>;
}
