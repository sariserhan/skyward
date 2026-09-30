import rows from '../../data/airport-terrain.json' with {type:'json'};
import {runwayDatums} from './runwayTerrain.ts';
const M=111320;
const delta=(a:number,b:number)=>((a-b+540)%360)-180;
export const terrainAirports=rows.map(row=>{
 const [id,lon,lat,west,south,east,north,height]=row as [string,number,number,number,number,number,number,number|null];
 if(height!==null)runwayDatums.set(id,height);
 return {id,lon,lat,west,south,east,north,height};
});
type Airport=typeof terrainAirports[number];
export function airportGroundDistance(a:Airport,lon:number,lat:number){
 const x=delta(lon,a.lon),scale=M*Math.max(.01,Math.cos(a.lat*Math.PI/180));
 return Math.hypot(Math.max(a.west-x,0,x-a.east)*scale,Math.max(a.south-lat,0,lat-a.north)*M);
}
export function levelAirportHeight(a:Airport,lon:number,lat:number,height:number,cellM:number){
 const datum=runwayDatums.get(a.id);if(datum===undefined)return height;
 // Extra flat samples at the edge prevent mesh interpolation from bending roads.
 const distance=airportGroundDistance(a,lon,lat),shoulder=Math.max(30,cellM*1.5),feather=Math.max(200,cellM*2);
 const t=Math.max(0,Math.min(1,(distance-shoulder)/feather));
 return datum+(height-datum)*t*t*(3-2*t);
}
export function flattenAirportTile(buffer:Float32Array,x:number,y:number,z:number,size=65){
 if(z<8)return buffer;
 const n=2**z,lonAt=(col:number)=>(x+col/(size-1))/n*360-180,latAt=(row:number)=>Math.atan(Math.sinh(Math.PI*(1-2*(y+row/(size-1))/n)))*180/Math.PI;
 const west=lonAt(0),east=lonAt(size-1),north=latAt(0),south=latAt(size-1),center=(west+east)/2;
 const cellM=360/n/(size-1)*M*Math.cos((north+south)*Math.PI/360),pad=(cellM*4+250)/M;
 const candidates=terrainAirports.filter(a=>{
  const offset=delta(a.lon,center),margin=pad/Math.max(.01,Math.cos(a.lat*Math.PI/180));
  return a.north+pad>=south&&a.south-pad<=north&&offset+a.east+margin>=-(east-west)/2&&offset+a.west-margin<=(east-west)/2;
 });
 if(!candidates.length)return buffer;
 for(const a of candidates)if(!runwayDatums.has(a.id)){
  const col=Math.max(0,Math.min(size-1,Math.round(delta(a.lon,west)/(east-west)*(size-1))));
  const row=Math.max(0,Math.min(size-1,Math.round((north-a.lat)/(north-south)*(size-1))));
  runwayDatums.set(a.id,buffer[row*size+col]);
 }
 const output=buffer.slice();
 for(let row=0;row<size;row++)for(let col=0;col<size;col++){
  const lon=lonAt(col),lat=latAt(row);let nearest:Airport|undefined,best=Infinity,centerBest=Infinity;
  for(const a of candidates){const d=airportGroundDistance(a,lon,lat),c=Math.hypot(delta(lon,a.lon)*Math.cos(a.lat*Math.PI/180),lat-a.lat);if(d<best||(d===best&&c<centerBest)){nearest=a;best=d;centerBest=c;}}
  if(nearest)output[row*size+col]=levelAirportHeight(nearest,lon,lat,buffer[row*size+col],cellM);
 }
 return output;
}
