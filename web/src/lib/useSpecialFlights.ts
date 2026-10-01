import {useSyncExternalStore} from 'react';
import type {Aircraft} from '../types';
export type SpecialFlight={path:string;aircraftId:string;registration:string;entityId:string;name:string;relationship:string;aircraft:Aircraft};
type Snapshot={state:'loading'|'ready'|'partial'|'unavailable';rows:SpecialFlight[];checkedAt:number|null;checkedAircraft:number;totalAircraft:number};
declare global{interface Window{skywardSpecialFlights?:{getSnapshot:()=>Snapshot}}}
const initial:Snapshot={state:'loading',rows:[],checkedAt:null,checkedAircraft:0,totalAircraft:0};
const subscribe=(callback:()=>void)=>{window.addEventListener('skyward:special-flights',callback);return()=>window.removeEventListener('skyward:special-flights',callback);};
const read=()=>window.skywardSpecialFlights?.getSnapshot()??initial;
export const useSpecialFlights=()=>useSyncExternalStore(subscribe,read,()=>initial);
