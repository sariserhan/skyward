import {specialFlightRoute} from './specialFlightRoutes.ts';
import {AIRPORTS,validAirport} from './airportCatalog.ts';
import type {Aircraft} from '../types.ts';
export type ObservatoryRoute={kind:'airport';id:string}|{kind:'flight';code:string;date?:string;registration?:string;collection?:string}|{kind:'globe'};
export function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function observatoryRoute(path:string):ObservatoryRoute|null{
 if(['/','/watch','/watch/','/watch/index.html','/index.html'].includes(path))return {kind:'globe'};
 const special=specialFlightRoute(path);if(special)return {kind:'flight',code:special.registration,registration:special.registration,collection:special.name};
 const airport=path.match(/^\/airports\/([a-z0-9-]{3,12})\/?$/i);if(airport)return validAirport(airport[1].toUpperCase())?{kind:'airport',id:airport[1].toUpperCase()}:null;
 const flight=path.match(/^\/flights\/([a-z0-9]{2,10})(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/i);
 return flight&&(!flight[2]||validDate(flight[2]))?{kind:'flight',code:flight[1].toUpperCase(),date:flight[2]}:null;
}
export function aircraftPath(a:Aircraft){const code=a.callsign.trim().toUpperCase();return !a.simulation&&/^[A-Z0-9]{2,10}$/.test(code)?`/flights/${code}/`: '/';}
export function routeMetadata(path:string){const r=observatoryRoute(path);if(r?.kind==='airport'){const a=AIRPORTS[r.id];return {title:`${a.name} (${r.id}) · Skyward`,description:`${a.city}, ${a.country}. Explore the airport and available aircraft observations in Skyward.`,noindex:false};}if(r?.kind==='flight'&&r.registration)return {title:`${r.collection} · ${r.registration} aircraft · Skyward`,description:'Watch this aircraft when a recent airborne observation is available. Aircraft associations do not identify passengers.',noindex:true};if(r?.kind==='flight')return {title:`${r.code}${r.date?' · '+r.date:''} flight lookup · Skyward`,description:r.date?`Available observations for ${r.code} on ${r.date} (UTC). Historical tracking is not available.`:'Look for the most recent available aircraft observation.',noindex:true};return {title:'Skyward · 3D Flight Tracker & Airport Explorer',description:'Explore live reported aircraft, estimated flight routes, and mapped airport gates and runways on an interactive satellite globe.',noindex:false};}
export function updateRouteMetadata(path=location.pathname){const m=routeMetadata(path);document.title=m.title;const meta=(key:string,value:string,property=false)=>{const attr=property?'property':'name';let el=document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);if(!el){el=document.createElement('meta');el.setAttribute(attr,key);document.head.append(el);}el.content=value;};meta('description',m.description);meta('robots',m.noindex?'noindex,follow':'index,follow');meta('og:title',m.title,true);meta('og:description',m.description,true);meta('og:url','https://skyvvard.com'+path,true);let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href='https://skyvvard.com'+path;
 const route=observatoryRoute(path),schema:Record<string,unknown>[]=[{'@type':'WebSite',name:'Skyward',url:'https://skyvvard.com/'}];
 if(route?.kind==='airport'){const a=AIRPORTS[route.id];schema.push({'@type':'Airport',name:a.name,iataCode:a.iata,icaoCode:a.icao,url:canonical.href,geo:{'@type':'GeoCoordinates',latitude:a.lat,longitude:a.lon}});}
 let data=document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');if(!data){data=document.createElement('script');data.type='application/ld+json';document.head.append(data);}data.textContent=JSON.stringify({'@context':'https://schema.org','@graph':schema});
}
/** Only explicit selections call this. Camera animation never writes browser history. */
export function navigateSelection(path:string,hash=''){const target=path+hash;if(location.pathname+location.search+location.hash!==target)history.pushState(null,'',target);updateRouteMetadata(path);}
