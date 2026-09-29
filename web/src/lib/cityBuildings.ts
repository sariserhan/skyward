export type CityTile={x:number;y:number;z:number;key:string};
export type CityBuilding={rings:number[][][];height:number;base:number};
export function cityTiles(lon:number,lat:number,quality:string,z=14):CityTile[]{
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>85)return [];
 const n=2**z,x=((lon+180)/360*n%n+n)%n,y=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n;
 const candidates:CityTile[]=[];
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const tx=(Math.floor(x)+dx+n)%n,ty=Math.floor(y)+dy;if(ty>=0&&ty<n)candidates.push({x:tx,y:ty,z,key:`${z}/${tx}/${ty}`});}
 return candidates.sort((a,b)=>{const d=(t:CityTile)=>Math.min(Math.abs(t.x+.5-x),n-Math.abs(t.x+.5-x))**2+(t.y+.5-y)**2;return d(a)-d(b);}).slice(0,quality==='low'?4:9);
}
export function cityHeight(properties:Record<string,unknown>){
 const height=Number(properties.render_height),base=Number(properties.render_min_height);
 return {height:Number.isFinite(height)&&height>0?Math.min(1200,height):9,base:Number.isFinite(base)&&base>0?Math.min(1199,base):0};
}
/** Remove vector-tile buffers so neighboring tile meshes do not overlap. */
export function clipCityRing(points:{x:number;y:number}[],extent:number){
 let ring=points;
 for(const [axis,bound,sign] of [['x',0,1],['x',extent,-1],['y',0,1],['y',extent,-1]] as const){
  const output:typeof ring=[];
  for(let i=0;i<ring.length;i++){const a=ring[(i+ring.length-1)%ring.length],b=ring[i],insideA=(a[axis]-bound)*sign>=0,insideB=(b[axis]-bound)*sign>=0;
   if(insideA!==insideB){const t=(bound-a[axis])/(b[axis]-a[axis]);output.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}if(insideB)output.push(b);
  }ring=output;
 }
 return ring;
}
