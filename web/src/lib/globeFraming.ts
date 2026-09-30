/** Fit the Earth inside the smaller camera field of view, with limb padding. */
export function globeAltitude(width:number,height:number,fov=Math.PI/3){
 const aspect=Math.max(1,width)/Math.max(1,height);
 const smallFov=2*Math.atan(Math.tan(fov/2)*Math.min(aspect,1/aspect));
 return Math.max(12000000,6378137*1.12/Math.sin(smallFov/2)-6378137);
}
