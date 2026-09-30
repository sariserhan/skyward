import {mercatorY,miniMapTiles,mapTile} from '../lib/miniMapTiles';
import {readFlightPreferences,saveFlightPreferences} from '../lib/flightPreferences';
import {sharedLiveMotion} from '../lib/liveMotion';
import {nearestCity} from '../lib/cities';
import {trackDistance} from '../lib/positionQuality';
import {routeArc} from '../lib/routeOverview';
import {useEffect,useRef,useState} from 'react';
import type {Aircraft,FlightRoute,TrailPoint} from '../types';
import {coloredTrail} from '../lib/positionQuality';
import type {City} from '../lib/cities';
type World={features:{geometry:{type:string;coordinates:number[][][]|number[][][][]}}[]};
let cached:World|null=null;
export function FlightMiniMap({aircraft:reported,cities,route,trail=[],routeView=false,followDisplayed=false,positionLabel=followDisplayed?'Displayed aircraft position':'Reported position'}:{aircraft:Aircraft;cities:City[];route:FlightRoute|null;trail?:TrailPoint[];routeView?:boolean;followDisplayed?:boolean;positionLabel?:string}){
 const [tileStatus,setTileStatus]=useState('Loading detailed map…');
 const [displayed,setDisplayed]=useState<{hex:string;lat:number;lon:number;heading:number}|null>(null);
 useEffect(()=>{setDisplayed(null);if(!followDisplayed)return;const update=()=>{const frame=sharedLiveMotion.displayed(reported.hex);setDisplayed(frame?{hex:reported.hex,lat:frame.lat,lon:frame.lon,heading:frame.heading}:null);};update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[followDisplayed,reported.hex]);
 const a=followDisplayed&&displayed?.hex===reported.hex?{...reported,...displayed}:reported;
 const hasRoute=!!route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status)&&route.airports.length===2;
 const canvas=useRef<HTMLCanvasElement>(null),[world,setWorld]=useState(cached),[error,setError]=useState(false),[view,setView]=useState<'route'|'regional'|'world'>(routeView?'route':'regional'),[zoom,setZoom]=useState(()=>readFlightPreferences().mapZoom),[nearbyCities,setNearbyCities]=useState<City[]>([]);const effectiveView=view==='route'&&!hasRoute?'regional':view,wide=effectiveView==='world';
 useEffect(()=>{saveFlightPreferences({mapZoom:zoom});},[zoom]);
 useEffect(()=>{if(cities.length)return;const c=new AbortController();fetch(`${import.meta.env.BASE_URL}data/cities.json`,{signal:c.signal}).then(r=>r.ok?r.json():null).then(d=>{if(!c.signal.aborted&&Array.isArray(d?.cities))setNearbyCities(d.cities);}).catch(()=>{});return()=>c.abort();},[cities.length]);
 const city= a.lon!==null&&a.lat!==null?nearestCity(cities.length?cities:nearbyCities,a.lon,a.lat):null;
 const destination=route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status)&&route.airports.length===2?route.airports[1]:null;
 useEffect(()=>{if(cached)return;const c=new AbortController();fetch(`${import.meta.env.BASE_URL}data/world.geojson`,{signal:AbortSignal.any([c.signal,AbortSignal.timeout(15000)])}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!c.signal.aborted){cached=d;setWorld(d);}}).catch(()=>{if(!c.signal.aborted)setError(true);});return()=>c.abort();},[]);
 useEffect(()=>{
  const ctx=canvas.current?.getContext('2d');if(!ctx)return;if(a.lat===null||a.lon===null){ctx.clearRect(0,0,600,300);return;}
  const W=600,H=300;let cx=wide?0:a.lon,cy=wide?0:a.lat,span=wide?360:zoom;
  const airports=route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status)&&route.airports.length===2?route.airports:[];
  if(effectiveView==='route'&&airports.length===2){const pts=[...airports,{lon:a.lon,lat:a.lat},...trail.slice(-1000)],base=airports[0].lon,lons=pts.map(p=>base+((p.lon-base+540)%360)-180),lats=pts.map(p=>mercatorY(p.lat));cx=((Math.min(...lons)+Math.max(...lons))/2+540)%360-180;cy=Math.atan(Math.sinh(Math.PI*(1-Math.min(...lats)-Math.max(...lats))))*180/Math.PI;span=Math.min(360,Math.max(8,(Math.max(...lons)-Math.min(...lons))*1.3,(Math.max(...lats)-Math.min(...lats))*360*2.6));}const scale=W/span,worldPixels=scale*360;
  let disposed=false,paintFrame=0;const tiles=miniMapTiles(cx,cy,span,W,H).map(t=>({...t,base:mapTile(t.z,t.x,t.y),labels:mapTile(t.z,t.x,t.y,true)}));
  const draw=()=>{if(disposed)return;
  ctx.fillStyle='#0a2335';ctx.fillRect(0,0,W,H);
  const x=(lon:number)=>W/2+(((lon-cx+540)%360)-180)*scale,y=(lat:number)=>H/2+(mercatorY(lat)-mercatorY(cy))*worldPixels;
  ctx.strokeStyle='#254554';ctx.lineWidth=1;
  for(let lat=-90;lat<=90;lat+=wide?30:5){ctx.beginPath();ctx.moveTo(0,y(lat));ctx.lineTo(W,y(lat));ctx.stroke();}
  for(let lon=-180;lon<180;lon+=wide?30:5){ctx.beginPath();ctx.moveTo(x(lon),0);ctx.lineTo(x(lon),H);ctx.stroke();}
  if(world)for(const f of world.features){const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates as number[][][]]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates as number[][][][]:[];
   for(const rings of polygons)for(const shift of [-360,0,360]){ctx.beginPath();for(const ring of rings){let last:number|undefined;ring.forEach(([lon,lat],i)=>{let dx=((lon-cx+540)%360)-180;if(last!==undefined){while(dx-last>180)dx-=360;while(dx-last< -180)dx+=360;}last=dx;const px=W/2+(dx+shift)*scale,py=y(lat);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.closePath();}ctx.fillStyle='#365953';ctx.fill('evenodd');ctx.strokeStyle='#66867e';ctx.stroke();}
  }
  for(const t of tiles){if(t.base.image)ctx.drawImage(t.base.image,t.left,t.top,t.size+.5,t.size+.5);if(t.labels.image)ctx.drawImage(t.labels.image,t.left,t.top,t.size+.5,t.size+.5);}
  ctx.fillStyle='rgba(4,15,24,.12)';ctx.fillRect(0,0,W,H);
  const path=(pts:{lon:number;lat:number}[],dashed:boolean,color:string)=>{ctx.beginPath();let last:number|undefined;for(const p of pts){const px=x(p.lon),py=y(p.lat);if(last===undefined||Math.abs(px-last)>W/2)ctx.moveTo(px,py);else ctx.lineTo(px,py);last=px;}ctx.strokeStyle=color;ctx.lineWidth=dashed?2:3;ctx.setLineDash(dashed?[7,6]:[]);ctx.stroke();ctx.setLineDash([]);};
  if(routeView&&airports.length===2){path(routeArc(airports[0],airports[1]),true,'#9f9bab');path(routeArc({lon:a.lon!,lat:a.lat!},airports[1]),true,'#d3b4fb');}
  for(const segment of coloredTrail(trail))path(segment.points,false,segment.color);
  const boxes:{x:number;y:number}[]=[];ctx.font='20px sans-serif';
  if(!wide&&!tiles.some(t=>t.labels.image))for(const c of (cities.length?cities:nearbyCities)){const px=x(c.lon),py=y(c.lat);if(px<10||px>W-110||py<20||py>H-25||boxes.some(b=>Math.abs(b.x-px)<115&&Math.abs(b.y-py)<30))continue;boxes.push({x:px,y:py});ctx.fillStyle='#e0e9da';ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#10232c';ctx.lineWidth=3;ctx.strokeText(c.name,px+7,py-5);ctx.fillText(c.name,px+7,py-5);if(boxes.length>=7)break;}
  if(route&&['PLAUSIBLE','UNVERIFIED'].includes(route.status))for(const p of route.airports){const px=x(p.lon),py=y(p.lat);if(px<12||px>W-80||py<20||py>H-20)continue;ctx.fillStyle='#d6bafb';ctx.fillRect(px-4,py-4,8,8);ctx.font='bold 18px sans-serif';ctx.strokeStyle='#10232c';ctx.lineWidth=3;ctx.strokeText(p.iata||p.icao,px+9,py+6);ctx.fillText(p.iata||p.icao,px+9,py+6);}
  ctx.save();ctx.translate(x(a.lon!),y(a.lat!));ctx.rotate((a.heading??0)*Math.PI/180);ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(3,-10);ctx.lineTo(3,-3);ctx.lineTo(14,5);ctx.lineTo(14,8);ctx.lineTo(3,4);ctx.lineTo(3,10);ctx.lineTo(7,13);ctx.lineTo(7,15);ctx.lineTo(0,12);ctx.lineTo(-7,15);ctx.lineTo(-7,13);ctx.lineTo(-3,10);ctx.lineTo(-3,4);ctx.lineTo(-14,8);ctx.lineTo(-14,5);ctx.lineTo(-3,-3);ctx.lineTo(-3,-10);ctx.closePath();ctx.fillStyle='#97f2d4';ctx.fill();ctx.strokeStyle='#07161f';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  const km=span*111.32*Math.cos(cy*Math.PI/180)*100/W;ctx.fillStyle='#fff';ctx.strokeStyle='#12232b';ctx.lineWidth=4;ctx.font='16px sans-serif';const label=km>=1?`${Math.round(km)} km`:`${Math.round(km*1000)} m`;ctx.strokeText(label,18,H-24);ctx.fillText(label,18,H-24);ctx.fillRect(18,H-17,100,3);ctx.font='bold 18px sans-serif';ctx.strokeText('N ↑',W-48,26);ctx.fillText('N ↑',W-48,26);
  };
  const repaint=()=>{if(disposed)return;cancelAnimationFrame(paintFrame);paintFrame=requestAnimationFrame(draw);};draw();
  const ready=tiles.filter(t=>t.base.image).length;setTileStatus(ready===tiles.length?'':ready?'Loading map detail…':'Loading detailed map…');
  for(const t of tiles)for(const entry of [t.base,t.labels])if(!entry.image)void entry.promise.then(repaint);
  void Promise.all(tiles.map(t=>t.base.promise)).then(()=>{if(!disposed)setTileStatus(tiles.every(t=>t.base.image)?'':'Some imagery unavailable · reference map retained');});
  return()=>{disposed=true;cancelAnimationFrame(paintFrame);};
 },[world,wide,effectiveView,zoom,nearbyCities,a.lat,a.lon,a.heading,cities,route,trail,routeView]);
 return <figure className="flight-minimap"><div><strong>{routeView&&hasRoute?'Route map':'Location map'}</strong><select aria-label="Mini-map view" value={effectiveView} onChange={e=>setView(e.target.value as typeof view)}><option value="route" disabled={!hasRoute}>Route</option><option value="regional">Nearby</option><option value="world">World</option></select>{effectiveView==='regional'&&<><button aria-label="Zoom mini-map in" disabled={zoom<=.03125} onClick={()=>setZoom(z=>Math.max(.03125,z/2))}>+</button><button aria-label="Zoom mini-map out" disabled={zoom>=64} onClick={()=>setZoom(z=>Math.min(64,z*2))}>−</button></>}</div><canvas ref={canvas} width="600" height="300" role="img" aria-label={`${routeView&&hasRoute?'Route map · ':''}${positionLabel} at ${a.lat?.toFixed(2)}, ${a.lon?.toFixed(2)} degrees`}/><figcaption>{city&&<span>{city.km} km {city.direction} of {city.city.name}. </span>}{destination&&a.lon!==null&&a.lat!==null&&<span>{Math.round(trackDistance({lon:a.lon,lat:a.lat},destination))} nm direct to {destination.iata||destination.icao}. </span>}{positionLabel}{tileStatus&&<span> · {tileStatus}{error?' · offline outlines unavailable':''}</span>}{hasRoute&&<> · purple squares: route airports</>}{trail.length>1&&<> · solid line: retained track</>}{routeView&&hasRoute&&<> · dashed purple: direct path to destination</>}</figcaption><details className="minimap-credits"><summary>Map credits</summary><small>Imagery: Esri, Vantor, Earthstar Geographics and the GIS User Community. Labels: Esri, HERE, Garmin, <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> and the GIS user community. Reference outlines: Natural Earth. Imagery is not live.</small></details></figure>;
}
