interface Vector {x:number;y:number;z:number;}
/** A finite Earth-fixed outward pose; sky views must not use an Earth-surface flight path. */
export function skyCameraPose(target:Vector){
 if(![target.x,target.y,target.z].every(Number.isFinite))return null;
 const length=Math.hypot(target.x,target.y,target.z);if(length<1||!Number.isFinite(length))return null;
 const direction={x:target.x/length,y:target.y/length,z:target.z/length};
 const reference=Math.abs(direction.z)>.99?{x:0,y:1,z:0}:{x:0,y:0,z:1};
 const cross=(a:Vector,b:Vector)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 const right=cross(direction,reference),size=Math.hypot(right.x,right.y,right.z);
 const up=cross({x:right.x/size,y:right.y/size,z:right.z/size},direction);
 return {direction,up,position:{x:direction.x*20000000,y:direction.y*20000000,z:direction.z*20000000}};
}
