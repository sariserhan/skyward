import {useMemo,useState} from 'react';
import type {Aircraft} from '../types';
import {solarElevation,sunDirectionFixed} from '../lib/solarLighting';
import {nearbyFeatures} from '../lib/nearbyFeatures';
import {reportDistanceKm} from '../lib/localWeather';
import {recentFlights} from '../lib/discovery';
export function ScenicDiscovery({rows,now,select}:{rows:Aircraft[];now:number;select:(a:Aircraft)=>void}){
 const [filter,setFilter]=useState('all');
 const choices=useMemo(()=>{const C=window.Cesium;if(!C)return [];const sun=sunDirectionFixed(C,C.JulianDate.fromDate(new Date(now)));const features=nearbyFeatures();return recentFlights(rows,now).filter(a=>!a.ground&&!a.simulation).flatMap(a=>{const elevation=solarElevation(C,C.Cartesian3.fromDegrees(a.lon!,a.lat!),sun);const landscape=features.map(f=>({...f,km:reportDistanceKm(f,{lat:a.lat!,lon:a.lon!})})).filter(f=>f.km<60).sort((a,b)=>a.km-b.km)[0];const twilight=elevation>=-6&&elevation<=10;if(!twilight&&!landscape)return [];return [{a,twilight,landscape,reason:[twilight?'Sun near horizon':null,landscape?`Near ${landscape.name} · ${Math.round(landscape.km)} km`:null].filter(Boolean).join(' · ')}];}).slice(0,30);},[rows,now]);
 const shown=choices.filter(c=>filter==='all'||(filter==='sun'?c.twilight:!!c.landscape));
 return <section><h3>Scenic flights</h3><label>Discover <select aria-label="Scenic flight filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All scenic candidates</option><option value="sun">Sunrise / sunset light</option><option value="land">Mapped landscapes</option></select></label><p>Recent airborne observations near twilight or named terrain and water features loaded around your flight view. Visibility depends on clouds, seat side and terrain; this is not a global search.</p><ul className="discovery-list">{shown.slice(0,8).map(c=><li key={c.a.hex}><button onClick={()=>{if(recentFlights([c.a],Date.now()).length)select(c.a);}}><strong>{c.a.callsign||c.a.hex}</strong><span>{c.reason}</span></button></li>)}</ul>{!shown.length&&<p>No matching recently observed flights in this session. More landscape candidates become available as mapped features load.</p>}</section>;
}
