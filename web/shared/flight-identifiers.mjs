// Airline-designator aliases, not a schedule or proof of a codeshare/flight instance.
// Sources and scope: data/flight-identifiers-sources.md. No runtime API/storage cost.
export const airlineDesignators=Object.freeze({
 UA:'UAL',AA:'AAL',DL:'DAL',AS:'ASA',B6:'JBU',F9:'FFT',WN:'SWA',
 A3:'AEE',EI:'EIN',SU:'AFL',AR:'ARG',AM:'AMX',
 TK:'THY',U8:'CYF',B7:'UIA',UN:'NUA','5X':'UPS',U6:'SVR',UQ:'CUH',BS:'UBG',
 UJ:'LMU','8R':'AIA',NH:'ANA',GP:'RIV',DM:'DWI',IZ:'AIZ',OZ:'AAR',KP:'SKK','3V':'TAY',
 K6:'KHV',AC:'ACA',TX:'FWI','9H':'CGN',CA:'CCA',XK:'CCM',EN:'DLA',UX:'AEA',AF:'AFR',GL:'GRL',EK:'UAE',
});
export const normalizeFlightInput=value=>String(value??'').trim().toUpperCase().replace(/\s+/g,'');
export function trackingFlightCode(value){
 const code=normalizeFlightInput(value);
 const passenger=/^([A-Z0-9]{2})(\d{1,4})$/.exec(code);
 if(passenger){
  const operator=airlineDesignators[passenger[1]];
  if(!operator)throw Error('This airline code is not supported yet. Use the operating flight’s tracking callsign, or check the operating airline on your ticket.');
  return operator+String(Number(passenger[2]));
 }
 return code;
}
export function passengerFlightAlias(value){
 const code=normalizeFlightInput(value),match=/^([A-Z]{3})(\d{1,4})$/.exec(code);
 if(!match)return null; // Never invent a passenger flight number from an alphanumeric callsign.
 const entry=Object.entries(airlineDesignators).find(([,icao])=>icao===match[1]);
 return entry?entry[0]+String(Number(match[2])):null;
}
export function flightDisplayCode(value){const alias=passengerFlightAlias(value);return alias?`${alias} · ${normalizeFlightInput(value)}`:normalizeFlightInput(value);}
export function isFlightSearch(value){const code=normalizeFlightInput(value);return /^[A-Z]{3}\d[A-Z0-9]{0,6}$/.test(code)||/^([A-Z0-9]{2})\d{1,4}$/.test(code);}
