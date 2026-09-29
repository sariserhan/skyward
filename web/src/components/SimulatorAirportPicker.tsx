import {useId,useState} from 'react';
import {AIRPORTS,searchAirports} from '../lib/airportCatalog';

export function SimulatorAirportPicker({label,value,onChange,disabled=false}:{label:string;value:string;onChange:(id:string)=>void;disabled?:boolean}){
 const [query,setQuery]=useState(''),id=useId();
 const results=searchAirports(query),selected=AIRPORTS[value],included=results.some(([code])=>code===value);
 const name=(code:string)=>{const a=AIRPORTS[code];return `${code} / ${a.icao} · ${a.city} · ${a.name} · ${a.country}`;};
 return <div className="sim-airport-picker"><label htmlFor={id}>{label}</label><input type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder="Search city, airport, country or code" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)}/><select id={id} value={value} disabled={disabled} onChange={e=>{onChange(e.target.value);setQuery('');}} required>{!included&&selected&&<optgroup label="Current selection"><option value={value}>{name(value)}</option></optgroup>}{results.map(([code])=><option key={code} value={code}>{name(code)}</option>)}</select><small>{disabled?'Return to your departure airport for this mission.':query?`${results.length.toLocaleString()} matching airports${results.length?'':' · clear search to see all'}`:`${Object.keys(AIRPORTS).length.toLocaleString()} airports worldwide`}</small>{selected&&<small>{selected.city}, {selected.country} · {selected.name}</small>}</div>;
}
