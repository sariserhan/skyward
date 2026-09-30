/** Resample Mercator elevation onto a complete geographic globe. Outside the
 * source's ±85.051° coverage, use sea/ice level; never stretch remote mountains
 * to the pole or request nonexistent source tiles. */
export async function reprojectTerrainTile(x:number,y:number,z:number,load:(x:number,y:number,z:number)=>Promise<Float32Array>,size=65){
 const n=2**z,out=new Float32Array(size*size),tiles=new Map<string,Float32Array>();
 for(let row=0;row<size;row++){
  const lat=90-(y+row/(size-1))/n*180;
  if(Math.abs(lat)>=85.0511287798066)continue;
  const sy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n;
  const ty=Math.max(0,Math.min(n-1,Math.floor(sy))),fy=(sy-ty)*(size-1),iy=Math.floor(fy),dy=fy-iy;
  // Feather only the last degree of available elevation into the flat cap.
  const fade=Math.min(1,(85.0511287798066-Math.abs(lat)));
  for(let col=0;col<size;col++){
   const sx=(x+col/(size-1))/2,tx=Math.max(0,Math.min(n-1,Math.floor(sx))),fx=(sx-tx)*(size-1),ix=Math.floor(fx),dx=fx-ix,key=`${tx}/${ty}`;
   let tile=tiles.get(key);if(!tile){tile=await load(tx,ty,z);tiles.set(key,tile);}
   const a=Math.max(0,Math.min(size-1,ix)),b=Math.min(size-1,a+1),c=Math.max(0,Math.min(size-1,iy)),d=Math.min(size-1,c+1);
   out[row*size+col]=((tile[c*size+a]*(1-dx)+tile[c*size+b]*dx)*(1-dy)+(tile[d*size+a]*(1-dx)+tile[d*size+b]*dx)*dy)*fade;
  }
 }
 return out;
}
