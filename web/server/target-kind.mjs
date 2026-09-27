// readsb emitter categories: A1–A7 aircraft; B1/B2/B6/B7 airborne classes;
// C1/C2 surface vehicles; C3–C5 obstructions. Missing/reserved categories stay unknown.
// Classification is provider-reported, not inferred from a callsign or lack of motion.
export function targetKind(category, type) {
 const c=String(category??'').toUpperCase(),t=String(type??'').toUpperCase();
 if(c==='C1'||c==='C2')return 'vehicle';
 if(/^C[3-5]$/.test(c))return 'fixed';
 if(/^A[1-7]$/.test(c)||/^B[1267]$/.test(c))return 'aircraft';
 if(t==='TWR')return 'fixed';
 if(t==='GRND')return 'vehicle';
 return 'unknown';
}
