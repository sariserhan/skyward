export function reattachBlend(elapsedSeconds:number,reduced:boolean){if(reduced)return 1;const t=Math.max(0,Math.min(1,elapsedSeconds/1.2));return t*t*(3-2*t);}
export function cameraFloor(terrain:number|undefined){return Math.max(0,Number.isFinite(terrain)?terrain!:0)+25;}
