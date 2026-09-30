import type {Aircraft} from '../types.ts';
import type {LiveFrame} from './liveMotion.ts';
/** Rendered arrival height and reported barometric altitude are different references. */
export function flightAltitude(a:Aircraft,frame:LiveFrame|null){
 const animated=!!(frame?.landingPhase||a.simulation),ground=frame?.ground??a.ground;
 const clearance=Math.max(0,frame?.groundClearance??0);
 const onGround=ground&&clearance<1;
 const altitude=frame?frame.altitude+clearance:a.altitude;
 const elevation=animated?(frame?.arrivalElevationFt??frame?.simulationElevationFt):undefined;
 return {onGround,altitude:altitude==null?null:Math.round(altitude),label:onGround?'0 ft above ground':animated?'ft above sea level':frame?.correcting||frame?.estimated?'ft displayed':'ft reported',elevation:onGround&&elevation!==undefined&&Number.isFinite(elevation)?Math.round(elevation):null};
}
