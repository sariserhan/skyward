import type {Aircraft} from '../types';
export interface CabinReference {
  id:string; label:string; minimum:number; maximum:number; configuration:string;
  publisher:string; url:string; checked:string; operatorReference?:boolean;
}
const checked='2026-09-27';
const boeing='https://www.boeing.com/commercial/737ng';
const ryanair='https://corporate.ryanair.com/about-us/our-fleet/';
export const cabinReferences:Record<string,CabinReference>={
  B788:{id:'B788',label:'787-8',minimum:200,maximum:275,configuration:'Typical two-class cabin',publisher:'Boeing',url:'https://www.boeing.com/commercial/787',checked},
  B789:{id:'B789',label:'787-9',minimum:250,maximum:325,configuration:'Typical two-class cabin',publisher:'Boeing',url:'https://www.boeing.com/commercial/787',checked},
  B78X:{id:'B78X',label:'787-10',minimum:300,maximum:375,configuration:'Typical two-class cabin',publisher:'Boeing',url:'https://www.boeing.com/commercial/787',checked},
  A21N:{id:'A21N',label:'A321neo',minimum:180,maximum:220,configuration:'Typical two-class cabin',publisher:'Airbus',url:'https://www.aircraft.airbus.com/en/aircraft/a320-family/a321neo',checked},
  B737:{id:'B737',label:'737-700',minimum:125,maximum:145,configuration:'Typical two-class cabin',publisher:'Boeing',url:boeing,checked},
  B738:{id:'B738',label:'737-800',minimum:160,maximum:180,configuration:'Typical two-class cabin',publisher:'Boeing',url:boeing,checked},
  B739:{id:'B739',label:'737-900',minimum:175,maximum:195,configuration:'Typical two-class cabin',publisher:'Boeing',url:boeing,checked},
  A20N:{id:'A20N',label:'A320neo',minimum:150,maximum:180,configuration:'Typical two-class cabin',publisher:'Airbus',url:'https://www.aircraft.airbus.com/en/aircraft/a320-family/a320neo',checked},
  'RYR:B738':{id:'RYR:B738',label:'Ryanair 737 Next Generation',minimum:189,maximum:189,configuration:'Published fleet seating configuration',publisher:'Ryanair',url:ryanair,checked,operatorReference:true},
  'RYR:B38M':{id:'RYR:B38M',label:'Ryanair 737-8200 Gamechanger',minimum:197,maximum:197,configuration:'Published Gamechanger configuration; exact subvariant unverified',publisher:'Ryanair',url:ryanair,checked,operatorReference:true},
  'THY:B738':{id:'THY:B738',label:'737-800 two-cabin reference',minimum:162,maximum:162,configuration:'Two-cabin example; source also lists a 189-seat single-cabin option',publisher:'Turkish Airlines',url:'https://www.turkishairlines.com/en-int/flights/fly-different/fleet/boeing-737-800/',checked,operatorReference:true},
};
// Never use the 3D model's family alias for seating: a freighter may share its geometry.
export function cabinReference(a:Pick<Aircraft,'aircraftType'|'callsign'|'targetKind'>):CabinReference|null {
  if(a.targetKind==='vehicle'||a.targetKind==='fixed')return null;
  const type=a.aircraftType.trim().toUpperCase(),operator=a.callsign.trim().toUpperCase().slice(0,3);
  return cabinReferences[`${operator}:${type}`]??cabinReferences[type]??null;
}
export function scenarioPassengers(capacity:number,occupancy:number):number {
  if(!Number.isFinite(capacity)||!Number.isFinite(occupancy)||capacity<0)return 0;
  return Math.round(Math.floor(capacity)*Math.max(0,Math.min(100,occupancy))/100);
}

export function officialCabinGuide(a:Pick<Aircraft,'callsign'|'aircraftType'>){
 const operator=a.callsign.trim().toUpperCase().slice(0,3);
 if(operator==='BAW')return {label:'British Airways official seat maps',url:'https://www.britishairways.com/content/information/seating/seat-maps',description:'Representative layouts; check your booking for the assigned aircraft.'};
 if(operator==='THY'&&a.aircraftType.trim().toUpperCase()==='B789')return {label:'Turkish Airlines 787-9 cabin guide',url:'https://www.turkishairlines.com/en-int/flights/fly-different/fleet/boeing-787/',description:'Published arrangement: Business 1–2–1; Economy 3–3–3. Exact tail configuration unverified.'};
 return null;
}
