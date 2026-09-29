import type * as Cesium from 'cesium';
declare global { interface Window { Cesium: typeof Cesium; CESIUM_BASE_URL: string; } }
export type AirportId = string;
export interface Aircraft { positionSource?:string; positionWarning?:string; category?: string; targetKind?: 'aircraft'|'vehicle'|'fixed'|'unknown'; hex: string; callsign: string; registration: string; aircraftType: string; lat: number | null; lon: number | null; altitude: number | null; ground: boolean; groundSpeed: number | null; heading: number | null; verticalRate: number | null; observedAt: number | null; sourceType: string; }
export interface FeedResponse { source: string; fetchedAt: number; sourceAt: number; aircraft: Aircraft[]; }
export interface TrailPoint { positionSource?:string; breakBefore?:boolean; groundSpeed?: number|null; lon: number; lat: number; altitude: number; time: number; ground: boolean; }
export interface Runway { id: string; a: [number, number]; b: [number, number]; width: number; length: number; }
export interface AirportGeometry { elevationFt?:number; id: AirportId; name: string; lat: number; lon: number; runways: Runway[]; surfaces: { kind: string; label: string; points: [number, number][]; height: number }[]; paths: { points: [number, number][]; kind: string }[]; gates: { label: string; position: [number, number] }[]; source: string; coverage?: {runways:string; omittedRunways:number; buildings:string; gates:string; retrievedAt:string; sourceUrl:string}; osm?: {sourceUrl:string; retrievedAt:string}; }
export interface GeometryFile { airports: AirportGeometry[]; }
export interface FacilityTarget { id?: string; kind?: string; points?: [number, number][]; width?: number; airport: AirportId; lon: number; lat: number; label: string; range: number; }
export type CameraTarget = { type: 'night' | 'point' | 'world' | 'airport' | 'tower' | 'overview' | 'aircraft' | 'facility' | 'route'; airport?: AirportId; facility?: FacilityTarget; serial: number };
export interface RouteAirport { icao: string; iata: string; name: string; city: string; lat: number; lon: number; }
export interface FlightRoute { callsign: string; source: string; sourceUrl: string; fetchedAt: number; airports: RouteAirport[]; status: 'PLAUSIBLE' | 'UNVERIFIED' | 'POSITION_MISMATCH' | 'NOT_FOUND'; }
export interface MapCommand { action: 'left' | 'right' | 'north' | 'tilt'; serial: number; }
export { AIRPORTS } from './lib/airportCatalog';
