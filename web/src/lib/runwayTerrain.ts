import rows from '../../data/runway-terrain.json' with {type:'json'};
const M=111320;
export const runwayDatums=new Map<string,number>();
export const terrainRunways=rows.map(row=>{const [id,ax,ay,bx,by,width,height]=row as [string,number,number,number,number,number,number|null];if(height!==null)runwayDatums.set(id,height);return {id,ax,ay,bx,by,width,height};});
type Strip=typeof terrainRunways[number];
const delta=(a:number,b:number)=>((a-b+540)%360)-180;
export function runwayDistance(r:Strip,lon:number,lat:number){const cos=Math.cos((r.ay+r.by)*Math.PI/360),x=delta(lon,r.ax)*M*cos,y=(lat-r.ay)*M,dx=delta(r.bx,r.ax)*M*cos,dy=(r.by-r.ay)*M,L=dx*dx+dy*dy;if(!L)return Infinity;const t=Math.max(0,Math.min(1,(x*dx+y*dy)/L));return Math.hypot(x-t*dx,y-t*dy);}
/** Smooth only the runway corridor and its shoulder; retain surrounding relief.
 * A shared airport datum also keeps intersecting runways on the same plane. */
export function levelRunwayHeight(r:Strip,lon:number,lat:number,height:number,cellM:number){const datum=runwayDatums.get(r.id);if(datum===undefined)return height;const core=r.width/2+Math.max(35,cellM*1.5),feather=Math.max(80,cellM*1.5),distance=runwayDistance(r,lon,lat);const t=Math.max(0,Math.min(1,(distance-core)/feather));return datum+(height-datum)*(t*t*(3-2*t));}
export function flattenRunwayTile(buffer:Float32Array,x:number,y:number,z:number,size=65){
 if(z<8)return buffer;
 const n=2**z,lonAt=(col:number)=>(x+col/(size-1))/n*360-180,latAt=(row:number)=>Math.atan(Math.sinh(Math.PI*(1-2*(y+row/(size-1))/n)))*180/Math.PI;
 const west=lonAt(0),east=lonAt(size-1),north=latAt(0),south=latAt(size-1),cellM=360/n/(size-1)*M*Math.cos((north+south)*Math.PI/360),pad=(cellM*3+300)/M;
 const candidates=terrainRunways.filter(r=>{const center=(west+east)/2,ax=delta(r.ax,center),bx=ax+delta(r.bx,r.ax),margin=pad/Math.max(.01,Math.cos(north*Math.PI/180));return Math.max(r.ay,r.by)+pad>=south&&Math.min(r.ay,r.by)-pad<=north&&Math.max(ax,bx)>=-(east-west)/2-margin&&Math.min(ax,bx)<=(east-west)/2+margin;});
 if(!candidates.length)return buffer;const output=buffer.slice();
 for(const r of candidates)if(!runwayDatums.has(r.id)){const col=Math.max(0,Math.min(size-1,Math.round(delta(r.ax,west)/(east-west)*(size-1)))),row=Math.max(0,Math.min(size-1,Math.round((north-r.ay)/(north-south)*(size-1))));runwayDatums.set(r.id,buffer[row*size+col]);}
 for(let row=0;row<size;row++)for(let col=0;col<size;col++){const lon=lonAt(col),lat=latAt(row);let nearest:Strip|undefined,distance=Infinity;for(const r of candidates){const d=runwayDistance(r,lon,lat)-r.width/2;if(d<distance){distance=d;nearest=r;}}if(nearest)output[row*size+col]=levelRunwayHeight(nearest,lon,lat,buffer[row*size+col],cellM);}
 return output;
}
