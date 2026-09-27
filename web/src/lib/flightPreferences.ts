export const flightPreferenceKey='skyward.flight-view.v1';
export const flightDefaults={view:'side',distance:1.15,compact:false,focus:false,sheet:42};
export function sanitizeFlightPreferences(value:unknown){
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {view:typeof v.view==='string'&&['chase','side','orbit','area','pilot','cabin','bird'].includes(v.view)?v.view:'side',distance:typeof v.distance==='number'&&Number.isFinite(v.distance)?Math.max(.8,Math.min(2.4,v.distance)):1.15,compact:v.compact===true,focus:v.focus===true,sheet:typeof v.sheet==='number'&&Number.isFinite(v.sheet)?Math.max(24,Math.min(72,v.sheet)):42};
}
export function readFlightPreferences(){try{return sanitizeFlightPreferences(JSON.parse(localStorage.getItem(flightPreferenceKey)??'null'));}catch{return {...flightDefaults};}}
export function saveFlightPreferences(patch:Partial<typeof flightDefaults>){try{localStorage.setItem(flightPreferenceKey,JSON.stringify(sanitizeFlightPreferences({...readFlightPreferences(),...patch})));return true;}catch{return false;}}
