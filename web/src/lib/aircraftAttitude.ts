/**
 * Aircraft axes after Cesium's glTF conversion: +X nose, +Y left, +Z up.
 * Bank is positive for a right turn: positive X roll lowers the right (-Y)
 * wing. Cesium camera HPR uses the same sign. Screen-space horizon artwork
 * rotates oppositely because it shows the world relative to the aircraft.
 */
export const aircraftBankRadians=(bankDegrees:number)=>bankDegrees*Math.PI/180;
export function aircraftModelAttitude(headingDegrees:number,pitchDegrees:number,bankDegrees:number):[number,number,number]{
 return [(headingDegrees-90)*Math.PI/180,pitchDegrees*Math.PI/180,aircraftBankRadians(bankDegrees)];
}
