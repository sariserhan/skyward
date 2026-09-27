import {createContext,useContext,useState,type ReactNode} from 'react';
import type {RouteAirport} from '../types';
import type {DistanceUnit} from '../lib/routeUnits';
const Settings=createContext<{unit:DistanceUnit;setUnit:(u:DistanceUnit)=>void;viewAirport:(a:RouteAirport)=>void}>({unit:'nm',setUnit:()=>{},viewAirport:()=>{}});
export function RouteSettings({children,viewAirport}:{children:ReactNode;viewAirport:(a:RouteAirport)=>void}){const [unit,set]=useState<DistanceUnit>(()=>{try{const x=localStorage.getItem('skyward.route-unit');return x==='km'||x==='mi'?x:'nm';}catch{return 'nm';}});return <Settings.Provider value={{unit,setUnit:u=>{set(u);try{localStorage.setItem('skyward.route-unit',u);}catch{}},viewAirport}}>{children}</Settings.Provider>;}
export const useRouteSettings=()=>useContext(Settings);
export function RouteUnits(){const {unit,setUnit}=useRouteSettings();return <label className="route-units">Distance units<select aria-label="Route distance units" value={unit} onChange={e=>setUnit(e.target.value as DistanceUnit)}><option value="nm">Nautical miles</option><option value="km">Kilometres</option><option value="mi">Miles</option></select></label>;}
