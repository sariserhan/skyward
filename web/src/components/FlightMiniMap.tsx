import {routeArc} from '../lib/routeOverview';
import {useEffect,useRef,useState} from 'react';
import type {Aircraft,FlightRoute,TrailPoint} from '../types';
import {coloredTrail} from '../lib/positionQuality';
import type {City} from '../lib/cities';
type World={features:{geometry:{type:string;coordinates:number[][][]|number[][][][]}}[]};
let cached:World|null=null;
export function FlightMiniMap({aircraft:a,cities,route,trail=[],routeView=false}:{aircraft:Aircraft;cities:City[];route:FlightRoute|null;trail?:TrailPoint[];routeView?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),[world,setWorld]=useState(cached),[error,setError]=useState(false),[wide,setWide]=useState(false);
 useEffect(()=>{if(cached)return;const c=new AbortController();fetch(`${import.meta.env.BASE_URL}data/world.geojson`,{signal:AbortSignal.any([c.signal,AbortSignal.timeout(15000)])}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!c.signal.aborted){cached=d;setWorld(d);}}).catch(()=>{if(!c.signal.aborted)setError(true);});return()=>c.abort();},[]);
 useEffect(()=>{
  const ctx=canvas.current?.getContext('2d');if(!ctx||a.lat===null||a.lon===null)return;
  const W=600,H=300;let cx=wide?0:a.lon,cy=wide?0:a.lat,span=wide?360:30;
  const airports=route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status)&&route.airports.length===2?route.airports:[];
  if(routeView&&!wide&&airports.length===2){const pts=[...airports,{lon:a.lon,lat:a.lat},...trail.slice(-1000)],base=airports[0].lon,lons=pts.map(p=>base+((p.lon-base+540)%360)-180),lats=pts.map(p=>p.lat);cx=((Math.min(...lons)+Math.max(...lons))/2+540)%360-180;cy=(Math.min(...lats)+Math.max(...lats))/2;span=Math.min(360,Math.max(8,(Math.max(...lons)-Math.min(...lons))*1.3,(Math.max(...lats)-Math.min(...lats))*2.6));}const scale=W/span;
  ctx.fillStyle='#0a2335';ctx.fillRect(0,0,W,H);
  const x=(lon:number)=>W/2+(((lon-cx+540)%360)-180)*scale,y=(lat:number)=>H/2-(lat-cy)*scale;
  ctx.strokeStyle='#254554';ctx.lineWidth=1;
  for(let lat=-90;lat<=90;lat+=wide?30:5){ctx.beginPath();ctx.moveTo(0,y(lat));ctx.lineTo(W,y(lat));ctx.stroke();}
  for(let lon=-180;lon<180;lon+=wide?30:5){ctx.beginPath();ctx.moveTo(x(lon),0);ctx.lineTo(x(lon),H);ctx.stroke();}
  if(world)for(const f of world.features){const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates as number[][][]]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates as number[][][][]:[];
   for(const rings of polygons)for(const shift of [-360,0,360]){ctx.beginPath();for(const ring of rings){let last:number|undefined;ring.forEach(([lon,lat],i)=>{let dx=((lon-cx+540)%360)-180;if(last!==undefined){while(dx-last>180)dx-=360;while(dx-last< -180)dx+=360;}last=dx;const px=W/2+(dx+shift)*scale,py=y(lat);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.closePath();}ctx.fillStyle='#365953';ctx.fill('evenodd');ctx.strokeStyle='#66867e';ctx.stroke();}
  }
  const path=(pts:{lon:number;lat:number}[],dashed:boolean,color:string)=>{ctx.beginPath();let last:number|undefined;for(const p of pts){const px=x(p.lon),py=y(p.lat);if(last===undefined||Math.abs(px-last)>W/2)ctx.moveTo(px,py);else ctx.lineTo(px,py);last=px;}ctx.strokeStyle=color;ctx.lineWidth=dashed?2:3;ctx.setLineDash(dashed?[7,6]:[]);ctx.stroke();ctx.setLineDash([]);};
  if(routeView&&airports.length===2){path(routeArc(airports[0],airports[1]),true,'#9f9bab');path(routeArc({lon:a.lon,lat:a.lat},airports[1]),true,'#d3b4fb');}
  for(const segment of coloredTrail(trail))path(segment.points,false,segment.color);
  const boxes:{x:number;y:number}[]=[];ctx.font='20px sans-serif';
  if(!wide)for(const c of cities){const px=x(c.lon),py=y(c.lat);if(px<10||px>W-110||py<20||py>H-25||boxes.some(b=>Math.abs(b.x-px)<115&&Math.abs(b.y-py)<30))continue;boxes.push({x:px,y:py});ctx.fillStyle='#e0e9da';ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();ctx.fillText(c.name,px+7,py-5);if(boxes.length>=7)break;}
  if(route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status))for(const p of route.airports){const px=x(p.lon),py=y(p.lat);if(px<12||px>W-80||py<20||py>H-20)continue;ctx.fillStyle='#d6bafb';ctx.fillRect(px-4,py-4,8,8);ctx.font='bold 18px sans-serif';ctx.fillText(p.iata||p.icao,px+9,py+6);}
  ctx.save();ctx.translate(x(a.lon),y(a.lat));ctx.rotate((a.heading??0)*Math.PI/180);ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(9,10);ctx.lineTo(0,5);ctx.lineTo(-9,10);ctx.closePath();ctx.fillStyle='#97f2d4';ctx.fill();ctx.strokeStyle='#07161f';ctx.lineWidth=2;ctx.stroke();ctx.restore();
 },[world,wide,a.lat,a.lon,a.heading,cities,route,trail,routeView]);
 return <figure className="flight-minimap"><div><strong>{routeView?'Route map':'Location map'}</strong><button aria-pressed={wide} onClick={()=>setWide(v=>!v)}>{wide?(routeView?'Route map':'Regional map'):'World map'}</button></div><canvas ref={canvas} width="600" height="300" role="img" aria-label={`${routeView?'Route map · ':''}Reported aircraft position at ${a.lat?.toFixed(2)}, ${a.lon?.toFixed(2)} degrees`}/><figcaption>{error?'Coastlines unavailable · coordinate grid only':!world?'Loading reference map…':'Reported position'} · purple squares: estimated route airports{routeView&&<> · solid mint: observed track · dashed purple: direct path to destination</>}</figcaption></figure>;
}
