import {useEffect,useRef,useState} from 'react';
import type * as Cesium from 'cesium';
import type {Aircraft} from '../types';
import {accountRequest} from '../lib/membership';
import {cameraSnapshot,encodeCamera,type SharedCamera} from '../lib/sharedCamera';
export function WatchTogether({viewer,selected,selectAircraft}:{viewer:()=>Cesium.Viewer|null;selected:Aircraft|null;selectAircraft:(hex:string)=>Promise<void>}){
 const [room,setRoom]=useState(()=>{const q=new URLSearchParams(location.search);return {guest:q.get('room')||'',host:q.get('hostRoom')||''};}),[following,setFollowing]=useState(true),[message,setMessage]=useState('Connecting to watch room…'),[reactions,setReactions]=useState<any[]>([]);
 const state=useRef({viewer,selected,selectAircraft,following});state.current={viewer,selected,selectAircraft,following};
 useEffect(()=>{if(!room.guest&&!room.host)return;let alive=true,busy=false,lastHex='',lastUpdate=0;const controller=new AbortController();
  async function poll(){if(busy||document.hidden||!alive)return;busy=true;try{
   let r:any;
   if(room.host){const v=state.current.viewer();if(!v)return;const camera=cameraSnapshot(v);r=await accountRequest('/api/premium/rooms',{key:room.host,hex:state.current.selected&&!state.current.selected.simulation?state.current.selected.hex:null,camera:camera?encodeCamera(camera):null});}
   else{const res=await fetch('/api/watch-room/'+encodeURIComponent(room.guest),{cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});r=await res.json();if(!res.ok)throw Error(r.error||'Room unavailable.');}
   if(!alive)return;setReactions(r.reactions.filter((x:any)=>Date.now()-x.time<60000));setMessage(`${room.host?'Hosting':'Watching together'} · ends ${new Date(r.expires).toLocaleTimeString()}`);
   if(room.guest&&state.current.following&&r.updatedAt!==lastUpdate){
    if(r.state.hex&&r.state.hex!==lastHex){try{await state.current.selectAircraft(r.state.hex);lastHex=r.state.hex;}catch{setMessage('Host aircraft is outside available coverage; sharing the camera only.');}}
    if(!alive)return;const v=state.current.viewer(),p=r.state.camera as SharedCamera|null;
    if(v&&!v.isDestroyed()&&p){const C=window.Cesium;v.camera.cancelFlight();v.camera.flyTo({destination:C.Cartesian3.fromDegrees(p.lon,p.lat,p.height),orientation:{heading:p.heading,pitch:p.pitch,roll:p.roll},duration:.8});lastUpdate=r.updatedAt;}
   }
  }catch(e){if(alive)setMessage(e instanceof Error?e.message:'Room unavailable.');}finally{busy=false;}}
  void poll();const timer=setInterval(()=>void poll(),10000);return()=>{alive=false;controller.abort();clearInterval(timer);};
 },[room]);
 if(!room.host&&!room.guest)return null;
 async function react(reaction:string){try{await accountRequest('/api/watch-room/'+room.guest,{reaction});setMessage('Reaction sent.');}catch(e){setMessage(e instanceof Error?e.message:'Reaction unavailable.');}}
 return <aside className="watch-together-bar" aria-label="Watch together room"><strong>{message}</strong>{room.guest&&<><button onClick={()=>setFollowing(v=>!v)}>{following?'Pause following host':'Follow host camera'}</button><button aria-label="Send wave reaction" onClick={()=>void react('wave')}>👋</button><button aria-label="Send love reaction" onClick={()=>void react('love')}>♥</button><button aria-label="Send plane reaction" onClick={()=>void react('plane')}>✈</button></>}<span aria-live="polite">{reactions.slice(-5).map((r,i)=><span key={i}>{r.reaction==='love'?' ♥ ':r.reaction==='wave'?' 👋 ':' ✈ '}</span>)}</span><button onClick={()=>{setRoom({guest:'',host:''});const u=new URL(location.href);u.searchParams.delete('room');u.searchParams.delete('hostRoom');history.replaceState(null,'',u);}}>Leave room</button></aside>;
}
