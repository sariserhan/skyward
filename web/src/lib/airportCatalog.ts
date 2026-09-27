import catalog from '../../data/airport-catalog.json' with { type: 'json' };
export interface AirportEntry { name:string; country:string; countryCode:string; city:string; icao:string; iata:string; lat:number; lon:number; sourceUrl:string; retrievedAt:string; }
export const AIRPORTS: Record<string,AirportEntry> = catalog;
export function validAirport(id: string): boolean { return Object.hasOwn(AIRPORTS,id); }
export function searchAirports(query: string) {
 const q=query.trim().toLocaleLowerCase();
 return Object.entries(AIRPORTS).filter(([id,a])=>!q||`${id} ${a.icao} ${a.name} ${a.city} ${a.country}`.toLocaleLowerCase().includes(q)).sort(([id,a],[other,b])=>(id.toLowerCase()===q?-1:other.toLowerCase()===q?1:0)||a.name.localeCompare(b.name));
}
