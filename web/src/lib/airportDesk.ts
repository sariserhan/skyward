import type {Aircraft} from '../types';
import {AIRPORTS} from './airportCatalog.ts';
import {bearing} from './flightPresentation.ts';
export function airportDeskGroup(a:Aircraft,airport:string){const p=AIRPORTS[airport];if(!p||a.lat==null||a.lon==null)return 'Other observations';if(a.ground)return 'Reported on ground';if(a.heading==null||a.verticalRate==null)return 'Other observations';const difference=Math.abs(((a.heading-bearing({lat:a.lat,lon:a.lon},p)+540)%360)-180);if(difference<65&&a.verticalRate< -100)return 'Approaching · inferred';if(difference>115&&a.verticalRate>100)return 'Departing · inferred';return 'Other observations';}
