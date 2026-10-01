import rows from '../../data/special-aircraft-visuals.json' with {type:'json'};
import type {Aircraft} from '../types';
type Visual=Omit<typeof rows[number],'validFrom'|'validTo'>&{validFrom:string|null;validTo:string|null};
const byRegistration=new Map<string,Visual>(rows.map(r=>[r.registration,r]));
export function specialAircraftVisual(a:{registration?:string;aircraftType?:string;simulation?:unknown},now=Date.now()){
 if(a.simulation)return null;
 const row=byRegistration.get(a.registration?.trim().toUpperCase()??'');if(!row)return null;
 const day=new Date(now).toISOString().slice(0,10);
 if((row.validFrom&&day<row.validFrom)||(row.validTo&&day>=row.validTo))return null;
 // A provider type conflict may indicate reassignment; do not override or repaint it.
 if(a.aircraftType&&row.icaoType&&a.aircraftType.trim().toUpperCase()!==row.icaoType)return null;
 return row;
}
export function withSpecialAircraftType(a:Aircraft):Aircraft{
 if(a.aircraftType?.trim()||a.simulation)return a;
 const row=specialAircraftVisual(a);
 return row?.icaoType?{...a,aircraftType:row.icaoType}:a;
}
