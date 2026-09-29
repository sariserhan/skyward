import typeDetails from './aircraftTypeDetails.json' with {type:'json'};
import {sourcedModel} from './sourcedModels.ts';
// readsb emitter categories: A1–A7 aircraft; B1/B2/B6/B7 airborne classes;
// C1/C2 surface vehicles; C3–C5 obstructions. Known model types resolve unspecified categories.
// Classification is provider-reported, not inferred from a callsign or lack of motion.
export function targetKind(category:unknown, type:unknown) {
 const c=String(category??'').toUpperCase(),t=String(type??'').trim().toUpperCase();
 if(c==='C1'||c==='C2')return 'vehicle';
 if(/^C[3-5]$/.test(c))return 'fixed';
 if(/^A[1-7]$/.test(c)||/^B[1267]$/.test(c))return 'aircraft';
 if(t==='TWR')return 'fixed';
 if(t==='GRND')return 'vehicle';
 if(sourcedModel(t)||Object.hasOwn(typeDetails,t))return 'aircraft';
 return 'unknown';
}
