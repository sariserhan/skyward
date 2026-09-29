import type {AirportGeometry,FacilityTarget} from '../types';
/** Footprint extrusions, not surveyed architecture. Zero-height aprons stay flat. */
export function airportBuildingHeight(surface:{kind:string;height:number}):number|undefined {
  if(surface.kind==='apron')return undefined;
  return Number.isFinite(surface.height)&&surface.height>0?Math.min(surface.height,300):surface.kind==='terminal'?12:8;
}
export function airport3DTarget(airport:AirportGeometry):FacilityTarget {
  const buildings=airport.surfaces.filter(s=>s.kind!=='apron'&&s.points.length>=3);
  const terminals=buildings.filter(s=>s.kind==='terminal');
  const points=(terminals.length?terminals:buildings).flatMap(s=>s.points).filter(p=>p.every(Number.isFinite));
  const dx=(lon:number)=>((lon-airport.lon+540)%360)-180;
  const xs=points.map(p=>dx(p[0])),ys=points.map(p=>p[1]);
  const minX=xs.length?Math.min(...xs):0,maxX=xs.length?Math.max(...xs):0;
  const minY=ys.length?Math.min(...ys):airport.lat,maxY=ys.length?Math.max(...ys):airport.lat;
  const extent=Math.hypot((maxX-minX)*Math.cos(airport.lat*Math.PI/180),maxY-minY)*111320;
  return {airport:airport.id,kind:'airport3d',label:'3D airport',lon:((airport.lon+(minX+maxX)/2+540)%360)-180,lat:(minY+maxY)/2,range:points.length?Math.max(1600,Math.min(14000,extent*1.6)):7000};
}
