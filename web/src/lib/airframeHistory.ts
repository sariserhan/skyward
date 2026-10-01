import {matchAirframeObservation,type AirframeObservation} from './airframeObservations.ts';
import type {Airframe,Catalog} from './airframeCatalog.ts';
export type ImportedHistory={sourceName:string;sourceUrl:string;license:string;observations:AirframeObservation[]};
/** Local, explicit imports only. This does not authenticate the supplied evidence. */
export function parseAirframeHistory(text:string,c:Catalog,a:Airframe,now=Date.now()):ImportedHistory{
 if(text.length>131072)throw Error('History exceeds 128 KiB.');
 const value=JSON.parse(text);if(value?.version!==1||value.aircraftId!==a.id)throw Error('History must name this internal aircraft ID and version 1.');
 const sourceUrl=new URL(value.sourceUrl);if(sourceUrl.protocol!=='https:'||sourceUrl.username||sourceUrl.password)throw Error('An HTTPS source URL is required.');
 if(typeof value.sourceName!=='string'||!value.sourceName.trim()||value.sourceName.length>160||typeof value.license!=='string'||!value.license.trim()||value.license.length>160)throw Error('Source name and license are required.');
 if(!Array.isArray(value.observations)||!value.observations.length||value.observations.length>200)throw Error('Import 1–200 observations.');
 const observations:AirframeObservation[]=[],seen=new Set<number>();
 for(const raw of value.observations){if(!Number.isFinite(raw?.observedAt)||raw.observedAt>now||now-raw.observedAt>366*86400000)throw Error('History must be within the past year.');const match=matchAirframeObservation(c,{...a,retired:false},[raw],raw.observedAt);if(!match)throw Error('Observation does not match verified dated aircraft identifiers.');if(!seen.has(match.observedAt)){observations.push(match);seen.add(match.observedAt);}}
 return {sourceName:value.sourceName.trim(),sourceUrl:sourceUrl.href,license:value.license.trim(),observations:observations.sort((a,b)=>a.observedAt-b.observedAt)};
}
