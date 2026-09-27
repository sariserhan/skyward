export type DistanceUnit='nm'|'km'|'mi';
export function routeDistance(nm:number,unit:DistanceUnit){return Math.round(nm*(unit==='km'?1.852:unit==='mi'?1.150779448:1));}
