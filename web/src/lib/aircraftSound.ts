/** Illustrative aircraft-family sound; engine telemetry is not available. */
export function aircraftFamily(type:string=''):'helicopter'|'piston'|'turboprop'|'jet'{
 const code=type.trim().toUpperCase();
 if(/^(B06|B47|B407|B412|B429|B430|B505|EC\d|H60|H1[2346]|AS[356]|A109|A119|A139|A169|A189|R22|R44|R66|S76|S92|MD[569])/.test(code))return 'helicopter';
 if(/^(AT[47]|DH8|DHC|PC12|PC6|PC7|PC9|BE[23]|B350|C208|C02T|AC90|SF34|SB20|JS[34]|PAY)/.test(code))return 'turboprop';
 if(/^(C1[578]|PA[1234]|P28|P32|SR2|DR40|BE36|DA[46])/.test(code))return 'piston';
 return 'jet';
}
export function propulsionSound(type:string=''){
 const family=aircraftFamily(type);
 return {family,wave:family==='piston'?'triangle' as const:'sine' as const,beat:family==='helicopter'?18:family==='piston'?34:family==='turboprop'?78:0,depth:family==='helicopter'?.75:family==='piston'?.5:family==='turboprop'?.3:0};
}
