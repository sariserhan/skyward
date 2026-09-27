import {useEffect,useState} from 'react';
import type * as Cesium from 'cesium';
import type {AirportGeometry} from '../types';
import {towerPose} from '../lib/tower';
export function TowerView({viewer,airport,active,close}:{viewer:Cesium.Viewer|null;airport:AirportGeometry|undefined;active:boolean;close:()=>void}){
 const [runway,setRunway]=useState(0),[side,setSide]=useState(1),[revision,setRevision]=useState(0);
 useEffect(()=>{setRunway(0);setSide(1);},[airport?.id]);
 useEffect(()=>{const r=airport?.runways[runway],v=viewer;if(!active||!v||v.isDestroyed()||!r)return;const C=window.Cesium,pose=towerPose(r,side),elevation=v.scene.globe.getHeight(C.Cartographic.fromDegrees(pose.lon,pose.lat))??0;
  v.camera.cancelFlight();v.trackedEntity=undefined;v.camera.lookAtTransform(C.Matrix4.IDENTITY);v.camera.setView({destination:C.Cartesian3.fromDegrees(pose.lon,pose.lat,elevation+pose.height),orientation:{heading:pose.heading*Math.PI/180,pitch:-.10,roll:0}});v.scene.requestRender();
 },[viewer,airport,active,runway,side,revision]);
 if(!active)return null;
 return <section className="tower-view" aria-label="Virtual airport tower"><header><strong>{airport?.id} · Virtual tower</strong><button aria-label="Close tower view" onClick={close}>×</button></header><p>Illustrative viewpoint, 65 m above available terrain beside a runway. Not the airport’s actual control tower.</p><label>Runway viewpoint<select aria-label="Tower runway" value={runway} onChange={e=>setRunway(Number(e.target.value))}>{airport?.runways.map((r,i)=><option key={i} value={i}>{r.id}</option>)}</select></label><div><button onClick={()=>setSide(s=>-s)}>Opposite side</button><button onClick={()=>setRevision(n=>n+1)}>Reset tower camera</button></div><small>Drag to look around · aircraft are received observations, with coverage gaps.</small></section>;
}
