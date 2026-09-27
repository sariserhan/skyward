/** Aircraft-relative viewing positions in metres; exterior models have no verified interiors. */
export function aircraftViewpoint(view:'pilot'|'cabin',length:number,heading:number,side:'left'|'right'='right'){
 const size=Number.isFinite(length)?Math.max(5,Math.min(90,length)):40;
 const yaw=(Number.isFinite(heading)?heading:0)*Math.PI/180;
 const forward=view==='pilot'?size*.56:-size*.06;
 const right=view==='pilot'?0:(side==='right'?1:-1)*Math.max(1.1,size*.085);
 return {east:Math.sin(yaw)*forward+Math.cos(yaw)*right,north:Math.cos(yaw)*forward-Math.sin(yaw)*right,up:Math.max(1,size*.055),heading:yaw+(view==='cabin'?(side==='right'?1:-1)*Math.PI/2:0),pitch:(view==='pilot'?-3:-12)*Math.PI/180};
}
