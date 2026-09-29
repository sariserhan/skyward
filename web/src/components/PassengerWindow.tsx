import {useEffect,useState} from 'react';
import type * as Cesium from 'cesium';
import {solarElevation,sunDirectionFixed} from '../lib/solarLighting';
export function PassengerWindow({viewer,side,changeSide,exit}:{viewer:Cesium.Viewer;side:'left'|'right';changeSide:(side:'left'|'right')=>void;exit:()=>void}){
 const [shade,setShade]=useState(0),[night,setNight]=useState(false);
 useEffect(()=>{const update=()=>{if(document.hidden||viewer.isDestroyed())return;const C=window.Cesium;setNight(solarElevation(C,viewer.camera.positionWC,sunDirectionFixed(C,viewer.clock.currentTime))<-3);};update();const timer=setInterval(update,5000);return()=>clearInterval(timer);},[viewer]);
 return <section className={`passenger-window-view${night?' passenger-window-night':''}`} aria-label="Passenger window view">
  <div className="passenger-window-frame" aria-hidden="true"><div className="passenger-window-glass"/><div className="passenger-window-shade" style={{height:`${shade}%`}}><span/></div><div className="passenger-window-rim"/></div>
  <div className="passenger-window-controls"><strong>Window seat</strong><div role="group" aria-label="Passenger window side"><button aria-pressed={side==='left'} onClick={()=>changeSide('left')}>Left window</button><button aria-pressed={side==='right'} onClick={()=>changeSide('right')}>Right window</button></div><label>Shade<input aria-label="Window shade" type="range" min="0" max="100" step="5" value={shade} onChange={e=>setShade(Number(e.target.value))}/><output>{shade===0?'Open':shade===100?'Closed':`${shade}%`}</output></label><button onClick={exit}>Exit window view</button></div>
 </section>;
}
